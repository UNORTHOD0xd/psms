// INP-05 + INP-08 — Placement lifecycle, hours logging, supervisor approval,
// and coordinator site-visit notes.
//
// Visibility:
//   - STUDENT: their own placements (where placement.student_user_id = me).
//   - SUPERVISOR: placements where supervisor_user_id = me OR currently
//     authenticated via a magic-link bound to the placement.
//   - COORDINATOR/ADMIN: all placements.
//
// Hours-log lifecycle (PRC-04 input side):
//   PENDING → APPROVED   (supervisor approves)
//          → REJECTED    (supervisor rejects with comment)
//   Students may CREATE while their placement is ACTIVE; cannot edit after
//   submission (must withdraw and resubmit).
//
// Site visits (INP-08): coordinator creates a SiteVisitNote with optional
// follow-up actions; follow-ups can later be resolved.

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';
import { buildMagicLinkUrl, issueMagicLink } from '../auth/magic-link.js';
import { sendEmail } from '../notifications/email.js';

import {
  PLACEMENT_INCLUDE,
  mapHoursLog,
  mapPlacement,
  mapSiteVisit,
} from './mapper.js';

export const placementsRouter = Router();

// ── Visibility helper ──────────────────────────────────────────────────────

function placementWhereForRole(auth: NonNullable<Express.Request['auth']>) {
  switch (auth.role) {
    case 'COORDINATOR':
    case 'ADMINISTRATOR':
      return {};
    case 'STUDENT':
      return { student_user_id: auth.user_id };
    case 'SUPERVISOR':
      return { supervisor_user_id: auth.user_id };
    default: {
      // Exhaustiveness check — adding a new Role enum value must update this switch.
      const _exhaustive: never = auth.role;
      throw new Error(`Unhandled role in placementWhereForRole: ${String(_exhaustive)}`);
    }
  }
}

// ── List + detail ──────────────────────────────────────────────────────────

const ListQuerySchema = PaginationQuery.extend({
  status: z.enum(['PENDING_START', 'ACTIVE', 'COMPLETED', 'TERMINATED']).optional(),
  student_id: z.string().uuid().optional(),
  supervisor_id: z.string().uuid().optional(),
});

placementsRouter.get('/', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const params = ListQuerySchema.parse(req.query);
    const sort = parseSort(
      params.sort,
      ['created_at', 'start_date', 'end_date', 'status'],
      { field: 'start_date', dir: 'desc' },
    );
    const where = {
      ...placementWhereForRole(req.auth!),
      ...(params.status ? { status: params.status } : {}),
      ...(params.student_id ? { student_user_id: params.student_id } : {}),
      ...(params.supervisor_id ? { supervisor_user_id: params.supervisor_id } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.placement.findMany({
        where,
        include: PLACEMENT_INCLUDE,
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
      }),
      prisma.placement.count({ where }),
    ]);
    res.json(buildPage(params, rows.map(mapPlacement), total));
  } catch (err) {
    next(err);
  }
});

placementsRouter.get('/:placement_id', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.placement_id);
    const row = await prisma.placement.findFirst({
      where: { placement_id: id, ...placementWhereForRole(req.auth!) },
      include: PLACEMENT_INCLUDE,
    });
    if (!row) return sendProblem(res, Problems.notFound());
    res.json(mapPlacement(row));
  } catch (err) {
    next(err);
  }
});

// Coordinator can transition PENDING_START → ACTIVE on the placement's
// start_date (or after) — this is the trigger that lets the student begin
// logging hours. ACTIVE → COMPLETED happens automatically when the FINAL
// evaluation lands (PRC-08), but a coordinator may also trigger COMPLETED
// or TERMINATED manually here.
const StatusTransitionSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'TERMINATED']),
  terminated_reason: z.string().max(1000).optional(),
});

placementsRouter.post(
  '/:placement_id/status',
  requireRole('COORDINATOR'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.placement_id);
      const body = StatusTransitionSchema.parse(req.body);
      if (body.status === 'TERMINATED' && !body.terminated_reason) {
        return sendProblem(res, Problems.unprocessable('terminated_reason required'));
      }
      const before = await prisma.placement.findUnique({ where: { placement_id: id } });
      if (!before) return sendProblem(res, Problems.notFound());

      const allowed: Record<typeof before.status, string[]> = {
        PENDING_START: ['ACTIVE', 'TERMINATED'],
        ACTIVE: ['COMPLETED', 'TERMINATED'],
        COMPLETED: [],
        TERMINATED: [],
      };
      if (!allowed[before.status].includes(body.status)) {
        return sendProblem(
          res,
          Problems.unprocessable(`Cannot move placement from ${before.status} to ${body.status}`),
        );
      }

      const updated = await prisma.placement.update({
        where: { placement_id: id },
        data: {
          status: body.status,
          ...(body.status === 'TERMINATED'
            ? { terminated_reason: body.terminated_reason ?? null }
            : {}),
        },
        include: PLACEMENT_INCLUDE,
      });
      await writeAudit(req, {
        action: `placement.${body.status.toLowerCase()}`,
        resource_type: 'Placement',
        resource_id: id,
        before: { status: before.status },
        after: { status: updated.status },
      });
      res.json(mapPlacement(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ── Hours logs (INP-05) ────────────────────────────────────────────────────

const HoursInputSchema = z.object({
  week_number: z.number().int().min(1).max(52),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0.25).max(60),
  activity_narrative: z.string().min(20).max(2000),
});

placementsRouter.get(
  '/:placement_id/hours',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.placement_id);
      const placement = await prisma.placement.findFirst({
        where: { placement_id: id, ...placementWhereForRole(req.auth!) },
      });
      if (!placement) return sendProblem(res, Problems.notFound());

      const params = PaginationQuery.parse(req.query);
      const status = z
        .enum(['PENDING', 'APPROVED', 'REJECTED'])
        .optional()
        .parse(req.query.status);
      const where = { placement_id: id, ...(status ? { status } : {}) };
      const [rows, total] = await Promise.all([
        prisma.hoursLog.findMany({
          where,
          ...toSkipTake(params),
          orderBy: [{ week_number: 'desc' }, { date: 'desc' }],
        }),
        prisma.hoursLog.count({ where }),
      ]);
      res.json(buildPage(params, rows.map(mapHoursLog), total));
    } catch (err) {
      next(err);
    }
  },
);

placementsRouter.post(
  '/:placement_id/hours',
  requireRole('STUDENT'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.placement_id);
      const body = HoursInputSchema.parse(req.body);

      const placement = await prisma.placement.findUnique({ where: { placement_id: id } });
      if (!placement) return sendProblem(res, Problems.notFound());
      if (placement.student_user_id !== req.auth!.user_id) {
        return sendProblem(res, Problems.forbidden());
      }
      if (placement.status !== 'ACTIVE') {
        return sendProblem(
          res,
          Problems.unprocessable(`Cannot log hours while placement is ${placement.status}`),
        );
      }

      const logDate = new Date(body.date);
      if (logDate < placement.start_date || logDate > placement.end_date) {
        return sendProblem(res, Problems.unprocessable('Date is outside placement window'));
      }

      try {
        const created = await prisma.hoursLog.create({
          data: {
            placement_id: id,
            student_user_id: req.auth!.user_id,
            week_number: body.week_number,
            date: logDate,
            hours: body.hours,
            activity_narrative: body.activity_narrative,
          },
        });
        await writeAudit(req, {
          action: 'hours.submit',
          resource_type: 'HoursLog',
          resource_id: created.log_id,
          after: { week_number: created.week_number, hours: Number(created.hours) },
        });

        // Notify supervisor — best effort. Issue an HOURS_APPROVAL magic-link
        // so they can approve without a Knox account (PRC-03 + PRC-07).
        try {
          const supervisor = await prisma.user.findUnique({
            where: { user_id: placement.supervisor_user_id },
          });
          if (supervisor) {
            const issued = await issueMagicLink({
              supervisor_user_id: supervisor.user_id,
              placement_id: id,
              purpose: 'HOURS_APPROVAL',
              issued_by_user_id: req.auth!.user_id,
            });
            sendEmail({
              to: supervisor.email,
              subject: 'Knox PSMS — weekly hours awaiting approval',
              template: 'magic-link',
              user_id: supervisor.user_id,
              event_type: 'auth.magic_link.hours_approval',
              params: {
                full_name: supervisor.full_name,
                purpose: 'HOURS_APPROVAL',
                link: buildMagicLinkUrl(issued.raw_token),
                ttl_hours: 24,
              },
            }).catch(() => undefined);
          }
        } catch {
          // Magic-link rate-limit or other transient — we still return 201.
        }

        res.status(201).json(mapHoursLog(created));
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          return sendProblem(
            res,
            Problems.conflict('Hours already logged for this date in this week'),
          );
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },
);

// Hours decision: APPROVE | REJECT.
//
// Allowed actors:
//   - The placement's assigned supervisor (req.auth.role === SUPERVISOR and
//     auth.user_id matches the placement's supervisor_user_id), OR
//   - A COORDINATOR (override path).
const HoursDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    rejection_comment: z.string().max(1000).optional(),
  })
  .refine(
    (d) => d.decision === 'APPROVE' || (d.rejection_comment && d.rejection_comment.length > 0),
    { message: 'rejection_comment is required for REJECT', path: ['rejection_comment'] },
  );

placementsRouter.post(
  '/:placement_id/hours/:log_id/decision',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const placement_id = z.string().uuid().parse(req.params.placement_id);
      const log_id = z.string().uuid().parse(req.params.log_id);
      const body = HoursDecisionSchema.parse(req.body);

      const log = await prisma.hoursLog.findUnique({
        where: { log_id },
        include: { placement: { include: { student: true } } },
      });
      if (!log || log.placement_id !== placement_id) {
        return sendProblem(res, Problems.notFound());
      }
      if (log.status !== 'PENDING') {
        return sendProblem(res, Problems.unprocessable(`Hours log already ${log.status}`));
      }

      const isAssignedSupervisor =
        req.auth!.role === 'SUPERVISOR' &&
        log.placement.supervisor_user_id === req.auth!.user_id;
      const isCoordinator =
        req.auth!.role === 'COORDINATOR' || req.auth!.role === 'ADMINISTRATOR';
      if (!isAssignedSupervisor && !isCoordinator) {
        return sendProblem(res, Problems.forbidden('Not the assigned supervisor'));
      }

      const updated = await prisma.hoursLog.update({
        where: { log_id },
        data:
          body.decision === 'APPROVE'
            ? {
                status: 'APPROVED',
                approved_at: new Date(),
                approved_by_supervisor_id: req.auth!.user_id,
              }
            : {
                status: 'REJECTED',
                rejection_comment: body.rejection_comment ?? null,
              },
      });

      await writeAudit(req, {
        action: body.decision === 'APPROVE' ? 'hours.approve' : 'hours.reject',
        resource_type: 'HoursLog',
        resource_id: log_id,
        after: { status: updated.status },
      });

      // Notify the student.
      sendEmail({
        to: log.placement.student.email,
        subject:
          body.decision === 'APPROVE'
            ? 'Knox PSMS — hours approved'
            : 'Knox PSMS — hours need changes',
        template: 'hours-decision',
        user_id: log.placement.student_user_id,
        event_type: `hours.${body.decision.toLowerCase()}d`,
        params: {
          student_name: log.placement.student.full_name,
          week_number: log.week_number,
          hours: Number(log.hours),
          decision: body.decision,
          rejection_comment: body.rejection_comment ?? '',
        },
      }).catch(() => undefined);

      res.json(mapHoursLog(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ── Site visits (INP-08) ───────────────────────────────────────────────────

const SiteVisitInputSchema = z.object({
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  narrative: z.string().min(20).max(4000),
  overall_assessment: z.enum(['SATISFACTORY', 'CONCERNS', 'UNSATISFACTORY']),
  follow_up_actions: z
    .array(
      z.object({
        action: z.string().min(1).max(500),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .default([]),
});

placementsRouter.get(
  '/:placement_id/site-visits',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.placement_id);
      // Students can read their own placement's visits; supervisors can read
      // their assigned placements' visits; coordinators see all.
      const placement = await prisma.placement.findFirst({
        where: { placement_id: id, ...placementWhereForRole(req.auth!) },
      });
      if (!placement) return sendProblem(res, Problems.notFound());

      const rows = await prisma.siteVisitNote.findMany({
        where: { placement_id: id },
        include: { follow_up_actions: true },
        orderBy: { visit_date: 'desc' },
      });
      res.json(rows.map(mapSiteVisit));
    } catch (err) {
      next(err);
    }
  },
);

placementsRouter.post(
  '/:placement_id/site-visits',
  requireRole('COORDINATOR'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.placement_id);
      const body = SiteVisitInputSchema.parse(req.body);

      const placement = await prisma.placement.findUnique({ where: { placement_id: id } });
      if (!placement) return sendProblem(res, Problems.notFound());

      const created = await prisma.siteVisitNote.create({
        data: {
          placement_id: id,
          coordinator_user_id: req.auth!.user_id,
          visit_date: new Date(body.visit_date),
          narrative: body.narrative,
          overall_assessment: body.overall_assessment,
          follow_up_actions: {
            create: body.follow_up_actions.map((f) => ({
              action: f.action,
              due_date: new Date(f.due_date),
            })),
          },
        },
        include: { follow_up_actions: true },
      });

      await writeAudit(req, {
        action: 'site-visit.create',
        resource_type: 'SiteVisitNote',
        resource_id: created.note_id,
        after: { overall_assessment: created.overall_assessment },
      });

      res.status(201).json(mapSiteVisit(created));
    } catch (err) {
      next(err);
    }
  },
);

placementsRouter.post(
  '/:placement_id/site-visits/:note_id/follow-ups/:followup_id/resolve',
  requireRole('COORDINATOR'),
  async (req, res, next) => {
    try {
      const note_id = z.string().uuid().parse(req.params.note_id);
      const followup_id = z.string().uuid().parse(req.params.followup_id);

      const followup = await prisma.siteVisitFollowUp.findUnique({
        where: { followup_id },
      });
      if (!followup || followup.note_id !== note_id) {
        return sendProblem(res, Problems.notFound());
      }
      if (followup.resolved_at) {
        return sendProblem(res, Problems.unprocessable('Follow-up already resolved'));
      }

      const updated = await prisma.siteVisitFollowUp.update({
        where: { followup_id },
        data: { resolved_at: new Date() },
      });
      await writeAudit(req, {
        action: 'site-visit.followup.resolve',
        resource_type: 'SiteVisitFollowUp',
        resource_id: followup_id,
      });
      res.json({
        followup_id: updated.followup_id,
        resolved_at: updated.resolved_at?.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);
