// INP-10 — Admin user management + system configuration.

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';
import { sendEmail } from '../notifications/email.js';
import { loadEnv } from '../../lib/env.js';

export const adminRouter = Router();

const ListUsersSchema = PaginationQuery.extend({
  role: z.enum(['STUDENT', 'SUPERVISOR', 'COORDINATOR', 'ADMINISTRATOR']).optional(),
  q: z.string().max(200).optional(),
});

adminRouter.get('/users', requireRole('ADMINISTRATOR'), async (req, res, next) => {
  try {
    const params = ListUsersSchema.parse(req.query);
    const sort = parseSort(params.sort, ['created_at', 'last_signin_at'], {
      field: 'created_at',
      dir: 'desc',
    });
    const where = {
      ...(params.role ? { role: params.role } : {}),
      ...(params.q
        ? {
            OR: [
              { full_name: { contains: params.q, mode: 'insensitive' as const } },
              { email_lower: { contains: params.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          role: true,
          is_active: true,
          last_signin_at: true,
          created_at: true,
        },
      }),
      prisma.user.count({ where }),
    ]);
    res.json(buildPage(params, rows, total));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/users/:user_id/deactivate',
  requireRole('ADMINISTRATOR'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.user_id);
      const user = await prisma.user.findUnique({ where: { user_id: id } });
      if (!user) return sendProblem(res, Problems.notFound());
      if (!user.is_active) {
        return sendProblem(res, Problems.unprocessable('Already inactive'));
      }
      await prisma.$transaction([
        prisma.user.update({ where: { user_id: id }, data: { is_active: false } }),
        prisma.session.updateMany({
          where: { user_id: id, revoked_at: null },
          data: { revoked_at: new Date() },
        }),
      ]);
      await writeAudit(req, {
        action: 'admin.user.deactivate',
        resource_type: 'User',
        resource_id: id,
        before: { is_active: true },
        after: { is_active: false },
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/users/:user_id/force-password-reset',
  requireRole('ADMINISTRATOR'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.user_id);
      const user = await prisma.user.findUnique({ where: { user_id: id } });
      if (!user) return sendProblem(res, Problems.notFound());
      if (user.role === 'SUPERVISOR') {
        return sendProblem(
          res,
          Problems.unprocessable('Supervisors authenticate via magic link, not password'),
        );
      }
      // Revoke prior unconsumed reset tokens.
      await prisma.passwordResetToken.updateMany({
        where: { user_id: id, consumed_at: null },
        data: { consumed_at: new Date() },
      });
      const { randomBytes, createHash } = await import('node:crypto');
      const raw = randomBytes(32).toString('base64url');
      const token_hash = createHash('sha256').update(raw).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          user_id: id,
          token_hash,
          expires_at: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const env = loadEnv();
      await sendEmail({
        to: user.email,
        subject: 'Knox PSMS — password reset required',
        template: 'password-reset',
        user_id: user.user_id,
        event_type: 'admin.force_password_reset',
        params: {
          full_name: user.full_name,
          reset_url: `${env.PUBLIC_WEB_ORIGIN}/auth/reset?token=${encodeURIComponent(raw)}`,
          ttl_hours: 1,
        },
      });
      await writeAudit(req, {
        action: 'admin.user.force_password_reset',
        resource_type: 'User',
        resource_id: id,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ── /admin/config ──────────────────────────────────────────────────────────

const ALLOWED_KEYS = new Set([
  'banner.message',
  'banner.severity', // INFO | WARN | URGENT
  'quiet_hours.start_local', // HH:mm
  'quiet_hours.end_local',
]);

adminRouter.get('/config', requireRole('ADMINISTRATOR'), async (_req, res, next) => {
  try {
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: Array.from(ALLOWED_KEYS) } },
    });
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = r.value;
    res.json(out);
  } catch (err) {
    next(err);
  }
});

const ConfigPatchSchema = z.record(z.string(), z.unknown());

adminRouter.patch('/config', requireRole('ADMINISTRATOR'), async (req, res, next) => {
  try {
    const body = ConfigPatchSchema.parse(req.body ?? {});
    const unknownKeys = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k));
    if (unknownKeys.length > 0) {
      return sendProblem(
        res,
        Problems.badRequest(`Unknown config keys: ${unknownKeys.join(', ')}`),
      );
    }
    const before = await prisma.systemConfig.findMany({
      where: { key: { in: Object.keys(body) } },
    });
    const beforeMap = new Map(before.map((r) => [r.key, r.value]));

    const updates = Object.entries(body).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        create: { key, value: (value ?? null) as never, updated_by_user_id: req.auth!.user_id },
        update: { value: (value ?? null) as never, updated_by_user_id: req.auth!.user_id },
      }),
    );
    await prisma.$transaction(updates);

    await writeAudit(req, {
      action: 'admin.config.update',
      resource_type: 'SystemConfig',
      before: Object.fromEntries(beforeMap),
      after: body,
    });

    res.json(body);
  } catch (err) {
    next(err);
  }
});
