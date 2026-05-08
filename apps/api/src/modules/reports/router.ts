// OUT-02, OUT-06, OUT-07, OUT-09, OUT-10 — Reports HTTP surface.

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { signedUrl } from '../../lib/storage.js';
import { writeAudit } from '../../middleware/audit.js';
import { idempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/require-role.js';

import { buildAccreditationPack } from './accreditation.js';
import { csvDocument } from './csv.js';
import { buildCoordinatorDashboard } from './dashboard.js';
import { buildTranscriptPdf } from './transcript.js';

export const reportsRouter = Router();
export const studentTranscriptRouter = Router();

// ── /reports/coordinator-dashboard ────────────────────────────────────────

reportsRouter.get(
  '/coordinator-dashboard',
  requireRole('COORDINATOR_OR_ADMIN'),
  async (_req, res, next) => {
    try {
      const payload = await buildCoordinatorDashboard(prisma);
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },
);

// ── /reports/accreditation-pack ───────────────────────────────────────────
// In-memory pack registry. Pilot scope: process-local, lost on restart.
// Production should persist to a `report_run` table; deferred until a
// real scheduler exists.

interface PackJob {
  pack_id: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  storage_key?: string;
  download_url?: string;
  error?: string;
  created_at: string;
}
const PACKS = new Map<string, PackJob>();

const AccreditationFiltersSchema = z
  .object({
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    programme_codes: z.array(z.string()).optional(),
  })
  .default({});

reportsRouter.post(
  '/accreditation-pack',
  requireRole('COORDINATOR_OR_ADMIN'),
  idempotency,
  async (req, res, next) => {
    try {
      const filters = AccreditationFiltersSchema.parse(req.body ?? {});
      const pack_id = randomUUID();
      const job: PackJob = { pack_id, status: 'RUNNING', created_at: new Date().toISOString() };
      PACKS.set(pack_id, job);

      buildAccreditationPack(prisma, pack_id, {
        start_date: filters.start_date ? new Date(filters.start_date) : undefined,
        end_date: filters.end_date ? new Date(filters.end_date) : undefined,
        programme_codes: filters.programme_codes,
      })
        .then((pack) => {
          job.status = 'SUCCEEDED';
          job.storage_key = pack.storage_key;
          job.download_url = signedUrl(pack.storage_key);
        })
        .catch((err: unknown) => {
          job.status = 'FAILED';
          job.error = err instanceof Error ? err.message : String(err);
          logger.error({ err, pack_id }, 'accreditation pack build failed');
        });

      await writeAudit(req, {
        action: 'report.accreditation.start',
        resource_type: 'AccreditationPack',
        resource_id: pack_id,
        after: filters,
      });

      res.status(202).json({ pack_id, status: 'RUNNING' });
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  '/accreditation-pack/:pack_id',
  requireRole('COORDINATOR_OR_ADMIN'),
  (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.pack_id);
      const job = PACKS.get(id);
      if (!job) return sendProblem(res, Problems.notFound());
      res.json(job);
    } catch (err) {
      next(err);
    }
  },
);

// ── /reports/audit-log (OUT-09) ───────────────────────────────────────────

const AuditLogQuerySchema = PaginationQuery.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actor_user_id: z.string().uuid().optional(),
  actor_role: z.enum(['STUDENT', 'SUPERVISOR', 'COORDINATOR', 'ADMINISTRATOR']).optional(),
  action: z.string().max(100).optional(),
  resource_type: z.string().max(100).optional(),
  resource_id: z.string().max(64).optional(),
});

reportsRouter.get('/audit-log', requireRole('ADMINISTRATOR'), async (req, res, next) => {
  try {
    const params = AuditLogQuerySchema.parse(req.query);
    const sort = parseSort(params.sort, ['ts'], { field: 'ts', dir: 'desc' });
    const where = {
      ...(params.from || params.to
        ? {
            ts: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to ? { lte: new Date(params.to) } : {}),
            },
          }
        : {}),
      ...(params.actor_user_id ? { actor_user_id: params.actor_user_id } : {}),
      ...(params.actor_role ? { actor_role: params.actor_role } : {}),
      ...(params.action ? { action: { contains: params.action } } : {}),
      ...(params.resource_type ? { resource_type: params.resource_type } : {}),
      ...(params.resource_id ? { resource_id: params.resource_id } : {}),
    };

    const accept = req.header('accept') ?? '';
    const wantsCsv = accept.includes('text/csv');

    if (wantsCsv) {
      // Stream-friendly: pull in chunks to keep memory bounded.
      const chunks: string[] = [];
      const PAGE = 1000;
      let cursor: string | undefined;
      let total = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await prisma.auditLog.findMany({
          where,
          ...(cursor ? { cursor: { audit_id: cursor }, skip: 1 } : {}),
          take: PAGE,
          orderBy: { ts: 'desc' },
        });
        if (rows.length === 0) break;
        if (chunks.length === 0) {
          chunks.push(
            csvDocument(
              [
                'audit_id',
                'ts',
                'request_id',
                'actor_user_id',
                'actor_role',
                'action',
                'resource_type',
                'resource_id',
                'ip',
              ],
              rows.map((r) => [
                r.audit_id,
                r.ts.toISOString(),
                r.request_id ?? '',
                r.actor_user_id ?? '',
                r.actor_role ?? '',
                r.action,
                r.resource_type,
                r.resource_id ?? '',
                r.ip ?? '',
              ]),
            ),
          );
        } else {
          chunks.push(
            csvDocument(
              [],
              rows.map((r) => [
                r.audit_id,
                r.ts.toISOString(),
                r.request_id ?? '',
                r.actor_user_id ?? '',
                r.actor_role ?? '',
                r.action,
                r.resource_type,
                r.resource_id ?? '',
                r.ip ?? '',
              ]),
            ).slice(2), // strip the empty header line and one CRLF
          );
        }
        total += rows.length;
        cursor = rows[rows.length - 1]?.audit_id;
        if (rows.length < PAGE) break;
      }
      await writeAudit(req, {
        action: 'audit-log.export',
        resource_type: 'AuditLog',
        after: { rows: total, format: 'csv' },
      });
      res
        .status(200)
        .type('text/csv')
        .setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"')
        .send(chunks.join(''));
      return;
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json(buildPage(params, rows, total));
  } catch (err) {
    next(err);
  }
});

// ── /reports/hours-shortfall (OUT-10) ─────────────────────────────────────

const ShortfallQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
  threshold: z.coerce.number().min(0).max(1).default(0.5),
});

reportsRouter.get(
  '/hours-shortfall',
  requireRole('COORDINATOR_OR_ADMIN'),
  async (req, res, next) => {
    try {
      const { days, threshold } = ShortfallQuerySchema.parse(req.query);
      const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const placements = await prisma.placement.findMany({
        where: { status: 'ACTIVE', end_date: { lte: cutoff } },
        include: {
          student: { select: { user_id: true, full_name: true } },
        },
      });

      const rows: Array<{
        student_user_id: string;
        full_name: string;
        programme_code: string;
        hours_required: number;
        approved_hours: number;
        hours_remaining: number;
        placement_end_date: string;
        days_until_placement_ends: number;
        percent_complete: number;
      }> = [];

      for (const p of placements) {
        const profile = await prisma.studentProfile.findUnique({
          where: { user_id: p.student_user_id },
          include: { programme: { select: { programme_code: true } } },
        });
        if (!profile || profile.hours_required <= 0) continue;
        const sum = await prisma.hoursLog.aggregate({
          where: { student_user_id: p.student_user_id, status: 'APPROVED' },
          _sum: { hours: true },
        });
        const approved = Number(sum._sum.hours ?? 0);
        const pct = approved / profile.hours_required;
        if (pct >= threshold) continue;
        rows.push({
          student_user_id: p.student_user_id,
          full_name: p.student.full_name,
          programme_code: profile.programme.programme_code,
          hours_required: profile.hours_required,
          approved_hours: approved,
          hours_remaining: Math.max(profile.hours_required - approved, 0),
          placement_end_date: p.end_date.toISOString().slice(0, 10),
          days_until_placement_ends: Math.ceil(
            (p.end_date.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          ),
          percent_complete: Math.round(pct * 1000) / 1000,
        });
      }

      // Sort most at-risk first.
      rows.sort((a, b) => a.percent_complete - b.percent_complete);

      const accept = req.header('accept') ?? '';
      if (accept.includes('text/csv')) {
        const csv = csvDocument(
          [
            'student_user_id',
            'full_name',
            'programme_code',
            'hours_required',
            'approved_hours',
            'hours_remaining',
            'placement_end_date',
            'days_until_placement_ends',
            'percent_complete',
          ],
          rows.map((r) => [
            r.student_user_id,
            r.full_name,
            r.programme_code,
            r.hours_required,
            r.approved_hours,
            r.hours_remaining,
            r.placement_end_date,
            r.days_until_placement_ends,
            r.percent_complete,
          ]),
        );
        res
          .status(200)
          .type('text/csv')
          .setHeader('Content-Disposition', 'attachment; filename="hours-shortfall.csv"')
          .send(csv);
        return;
      }

      res.json({ data: rows, total: rows.length, params: { days, threshold } });
    } catch (err) {
      next(err);
    }
  },
);

// ── /students/:user_id/transcript (OUT-07) ────────────────────────────────

studentTranscriptRouter.get(
  '/:user_id/transcript',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.user_id);
      const role = req.auth!.role;
      if (
        role === 'STUDENT' && req.auth!.user_id !== id
      ) {
        return sendProblem(res, Problems.forbidden());
      }
      if (role !== 'STUDENT' && role !== 'COORDINATOR' && role !== 'ADMINISTRATOR') {
        return sendProblem(res, Problems.forbidden());
      }
      const pdf = await buildTranscriptPdf({
        prisma,
        student_user_id: id,
        generated_for_role: role,
      });
      await writeAudit(req, {
        action: 'report.transcript.read',
        resource_type: 'StudentProfile',
        resource_id: id,
      });
      res
        .status(200)
        .type('application/pdf')
        .setHeader('Content-Disposition', `inline; filename="transcript-${id}.pdf"`)
        .send(pdf);
    } catch (err) {
      next(err);
    }
  },
);
