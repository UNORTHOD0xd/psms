// PRC-07 inbox surface + SendGrid event webhook.
//
// Inbox endpoints are scoped to `req.auth.user_id` — there is no admin
// override in the pilot. Coordinators querying delivery state of a sent
// notification do so via the audit log + the recipient's notification
// row (visible only to the recipient).

import { createPublicKey, verify } from 'node:crypto';
import { Router, json as jsonBody } from 'express';
import { z } from 'zod';

import { loadEnv } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { requireRole } from '../../middleware/require-role.js';

export const notificationsRouter = Router();
export const sendgridWebhookRouter = Router();

// ── Inbox ─────────────────────────────────────────────────────────────────

const ListQuerySchema = PaginationQuery.extend({
  status: z
    .enum(['QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'READ'])
    .optional(),
  unread: z.coerce.boolean().optional(),
});

notificationsRouter.get('/', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const params = ListQuerySchema.parse(req.query);
    const sort = parseSort(params.sort, ['queued_at', 'sent_at', 'status'], {
      field: 'queued_at',
      dir: 'desc',
    });
    const where = {
      user_id: req.auth!.user_id,
      ...(params.status ? { status: params.status } : {}),
      ...(params.unread ? { read_at: null } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
        select: {
          notification_id: true,
          event_type: true,
          subject: true,
          body_template: true,
          status: true,
          queued_at: true,
          sent_at: true,
          delivered_at: true,
          read_at: true,
        },
      }),
      prisma.notification.count({ where }),
    ]);
    res.json(buildPage(params, rows, total));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post(
  '/:notification_id/read',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.notification_id);
      const row = await prisma.notification.findUnique({ where: { notification_id: id } });
      if (!row || row.user_id !== req.auth!.user_id) {
        return sendProblem(res, Problems.notFound());
      }
      // Idempotent: marking read twice is a no-op, not an error.
      const updated = row.read_at
        ? row
        : await prisma.notification.update({
            where: { notification_id: id },
            data: { status: 'READ', read_at: new Date() },
          });
      res.json({
        notification_id: updated.notification_id,
        status: updated.status,
        read_at: updated.read_at?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── SendGrid webhook ──────────────────────────────────────────────────────
//
// SendGrid event webhook v3 signs each request with ECDSA P-256 (DER
// signature, base64) over `timestamp + body`. The public key is set in
// SENDGRID_WEBHOOK_PUBLIC_KEY (PEM, single-line base64 DER, or PEM block).
// We accept the body as a raw Buffer because the signature is computed
// over the original bytes; bringing it through express.json would
// re-serialize and break the signature.

const SIGNATURE_HEADER = 'x-twilio-email-event-webhook-signature';
const TIMESTAMP_HEADER = 'x-twilio-email-event-webhook-timestamp';

// Map SendGrid event names → our NotificationStatus.
const STATUS_BY_EVENT: Record<string, 'DELIVERED' | 'BOUNCED' | 'FAILED' | null> = {
  delivered: 'DELIVERED',
  bounce: 'BOUNCED',
  dropped: 'FAILED',
  deferred: null,
  processed: null,
  open: null,
  click: null,
  spamreport: 'FAILED',
  unsubscribe: null,
  group_unsubscribe: null,
  group_resubscribe: null,
};

interface SendGridEvent {
  email?: string;
  event?: string;
  sg_message_id?: string;
  timestamp?: number;
  reason?: string;
  type?: string;
  status?: string;
}

function verifySignature(rawBody: Buffer, timestamp: string, signature: string, pubPem: string): boolean {
  try {
    const key = createPublicKey({ key: pubPem });
    const payload = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]);
    return verify(null, payload, key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

sendgridWebhookRouter.post(
  '/sendgrid',
  // Use the raw body parser so the signature is verified over the bytes
  // SendGrid actually sent. This overrides the parent's express.json.
  jsonBody({ verify: (req, _res, buf) => ((req as { rawBody?: Buffer }).rawBody = buf) }),
  requireRole('PUBLIC'),
  async (req, res, next) => {
    try {
      const env = loadEnv();
      const sig = req.header(SIGNATURE_HEADER) ?? '';
      const ts = req.header(TIMESTAMP_HEADER) ?? '';
      const rawBody = (req as { rawBody?: Buffer }).rawBody;

      if (!env.SENDGRID_WEBHOOK_PUBLIC_KEY) {
        // Without a configured public key we MUST refuse — accepting
        // anonymous events would let anyone flip a notification to
        // BOUNCED/FAILED. Configuration is required even in dev.
        return sendProblem(res, Problems.unauthorized('Webhook public key not configured'));
      }
      if (!sig || !ts || !rawBody) {
        return sendProblem(res, Problems.unauthorized('Missing signature headers'));
      }
      if (!verifySignature(rawBody, ts, sig, env.SENDGRID_WEBHOOK_PUBLIC_KEY)) {
        return sendProblem(res, Problems.unauthorized('Bad signature'));
      }

      // Reject stale signatures (replay protection). 5-minute window.
      const tsNum = Number(ts);
      if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
        return sendProblem(res, Problems.unauthorized('Stale signature'));
      }

      const events = (req.body ?? []) as SendGridEvent[];
      if (!Array.isArray(events)) {
        return sendProblem(res, Problems.badRequest('Body must be an array'));
      }

      let processed = 0;
      for (const ev of events) {
        if (!ev.sg_message_id || !ev.event) continue;
        // SendGrid suffixes the message id with .filterdrillN; the part
        // before the first dot matches the x-message-id we stored.
        const msgId = ev.sg_message_id.split('.')[0];
        const target = await prisma.notification.findFirst({
          where: { sendgrid_message_id: msgId },
          select: { notification_id: true, status: true },
        });
        if (!target) continue;

        await prisma.notificationDeliveryEvent.create({
          data: {
            notification_id: target.notification_id,
            event_type: ev.event,
            payload: ev as never,
            occurred_at: ev.timestamp ? new Date(ev.timestamp * 1000) : new Date(),
          },
        });

        const next_status = STATUS_BY_EVENT[ev.event];
        if (next_status) {
          await prisma.notification.update({
            where: { notification_id: target.notification_id },
            data: {
              status: next_status,
              ...(next_status === 'DELIVERED' ? { delivered_at: new Date() } : {}),
              ...(next_status !== 'DELIVERED'
                ? { failure_reason: (ev.reason ?? ev.event).slice(0, 500) }
                : {}),
            },
          });
        }
        processed += 1;
      }

      logger.info({ events: events.length, processed }, 'sendgrid webhook');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// Helper for tests / admin to inject events without SendGrid (used by
// integration tests). Not mounted on the public router.
export async function ingestDeliveryEventForTest(input: {
  notification_id: string;
  event_type: string;
  payload?: unknown;
}): Promise<void> {
  await prisma.notificationDeliveryEvent.create({
    data: {
      notification_id: input.notification_id,
      event_type: input.event_type,
      payload: (input.payload ?? null) as never,
      occurred_at: new Date(),
    },
  });
}

