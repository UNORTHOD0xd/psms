// INP-04 + PRC-02 — Application submission, decision flow, recommendations.

import { Router } from 'express';
import { z } from 'zod';

import { rankOpportunities, scoreOpportunity } from '@psms/shared';

import { prisma } from '../../lib/prisma.js';
import { loadEnv } from '../../lib/env.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';
import { OPPORTUNITY_INCLUDE, mapOpportunity } from '../opportunities/mapper.js';
import { buildMagicLinkUrl, issueMagicLink } from '../auth/magic-link.js';
import { hashPassword } from '../auth/password.js';
import { sendEmail } from '../notifications/email.js';

import { APPLICATION_INCLUDE, mapApplication } from './mapper.js';
import {
  loadPublishedOpportunitiesForMatching,
  loadStudentForMatching,
} from './matching-adapter.js';

export const applicationsRouter = Router();
export const recommendationsRouter = Router();

// ── /me/recommendations ────────────────────────────────────────────────────

recommendationsRouter.get('/', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const n = z.coerce.number().int().min(1).max(20).default(3).parse(req.query.n);
    const student = await loadStudentForMatching(req.auth!.user_id);
    if (!student) return sendProblem(res, Problems.notFound('Student profile not found'));

    const opps = await loadPublishedOpportunitiesForMatching();
    const ranked = rankOpportunities(student, opps, new Date(), n);
    const oppMap = new Map(opps.map((o) => [o.opportunity_id, o]));

    // Hydrate the opportunity payloads for the response.
    const ids = ranked.map((r) => r.opportunity_id);
    const fullRows = ids.length
      ? await prisma.opportunity.findMany({
          where: { opportunity_id: { in: ids } },
          include: OPPORTUNITY_INCLUDE,
        })
      : [];
    const fullMap = new Map(fullRows.map((o) => [o.opportunity_id, o]));

    const result = ranked
      .filter((r) => oppMap.has(r.opportunity_id) && fullMap.has(r.opportunity_id))
      .map((r) => ({
        opportunity: mapOpportunity(fullMap.get(r.opportunity_id)!),
        score: r.score,
        factors: r.factors,
      }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── /applications ──────────────────────────────────────────────────────────

const ListQuerySchema = PaginationQuery.extend({
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'WITHDRAWN']).optional(),
  opportunity_id: z.string().uuid().optional(),
});

applicationsRouter.get('/', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const params = ListQuerySchema.parse(req.query);
    // Supervisors don't see applications. Returning empty directly avoids
    // sending an invalid-UUID sentinel to Prisma (which would 500 the request).
    if (req.auth!.role === 'SUPERVISOR') {
      res.json(buildPage(params, [], 0));
      return;
    }
    const sort = parseSort(params.sort, ['submitted_at', 'status'], {
      field: 'submitted_at',
      dir: 'desc',
    });
    const where = {
      ...(req.auth!.role === 'STUDENT' ? { student_user_id: req.auth!.user_id } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.opportunity_id ? { opportunity_id: params.opportunity_id } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: APPLICATION_INCLUDE,
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
      }),
      prisma.application.count({ where }),
    ]);
    res.json(buildPage(params, rows.map(mapApplication), total));
  } catch (err) {
    next(err);
  }
});

const ApplicationInputSchema = z.object({
  opportunity_id: z.string().uuid(),
  motivation: z.string().min(50).max(2000),
  cv_url: z.string().url(),
});

applicationsRouter.post('/', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const body = ApplicationInputSchema.parse(req.body);

    const opp = await prisma.opportunity.findUnique({
      where: { opportunity_id: body.opportunity_id },
      include: { eligible_programmes: true },
    });
    if (!opp) return sendProblem(res, Problems.notFound('Opportunity not found'));
    if (opp.status !== 'PUBLISHED') {
      return sendProblem(res, Problems.unprocessable('Opportunity is not open for applications'));
    }
    if (opp.application_deadline < new Date()) {
      return sendProblem(res, Problems.unprocessable('Application deadline has passed'));
    }

    const profile = await prisma.studentProfile.findUnique({
      where: { user_id: req.auth!.user_id },
    });
    if (!profile) return sendProblem(res, Problems.unprocessable('No student profile'));

    if (
      opp.eligible_programmes.length > 0 &&
      !opp.eligible_programmes.some((ep) => ep.programme_id === profile.programme_id)
    ) {
      return sendProblem(res, Problems.unprocessable('Student programme is not eligible'));
    }

    // Compute and store score snapshot at submission time (PRC-02).
    const studentForMatch = await loadStudentForMatching(req.auth!.user_id);
    const oppsForMatch = await loadPublishedOpportunitiesForMatching();
    const oppForMatch = oppsForMatch.find((o) => o.opportunity_id === body.opportunity_id);
    const score =
      studentForMatch && oppForMatch
        ? scoreOpportunity(studentForMatch, oppForMatch, new Date()).score
        : null;

    try {
      const created = await prisma.application.create({
        data: {
          student_user_id: req.auth!.user_id,
          opportunity_id: body.opportunity_id,
          motivation: body.motivation,
          cv_url: body.cv_url,
          score_snapshot: score,
        },
        include: APPLICATION_INCLUDE,
      });

      await writeAudit(req, {
        action: 'application.submit',
        resource_type: 'Application',
        resource_id: created.application_id,
      });

      res.status(201).json(mapApplication(created));
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return sendProblem(res, Problems.conflict('Already applied to this opportunity'));
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

applicationsRouter.get('/:application_id', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.application_id);
    const row = await prisma.application.findUnique({
      where: { application_id: id },
      include: APPLICATION_INCLUDE,
    });
    if (!row) return sendProblem(res, Problems.notFound());
    if (req.auth!.role === 'SUPERVISOR') {
      return sendProblem(res, Problems.forbidden('Supervisors do not have access to applications'));
    }
    if (req.auth!.role === 'STUDENT' && row.student_user_id !== req.auth!.user_id) {
      return sendProblem(res, Problems.forbidden());
    }
    res.json(mapApplication(row));
  } catch (err) {
    next(err);
  }
});

const DecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'DECLINE']),
    decline_reason: z.string().max(1000).optional(),
  })
  .refine((d) => d.decision === 'APPROVE' || (d.decline_reason && d.decline_reason.length > 0), {
    message: 'decline_reason is required when decision = DECLINE',
    path: ['decline_reason'],
  });

applicationsRouter.post(
  '/:application_id/decision',
  requireRole('COORDINATOR'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.application_id);
      const body = DecisionSchema.parse(req.body);

      const app = await prisma.application.findUnique({
        where: { application_id: id },
        include: {
          opportunity: { include: { organisation: true } },
          student: true,
        },
      });
      if (!app) return sendProblem(res, Problems.notFound());
      if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
        return sendProblem(
          res,
          Problems.unprocessable(`Application already in terminal status ${app.status}`),
        );
      }

      if (body.decision === 'DECLINE') {
        const updated = await prisma.application.update({
          where: { application_id: id },
          data: {
            status: 'DECLINED',
            decided_at: new Date(),
            decided_by_user_id: req.auth!.user_id,
            decline_reason: body.decline_reason ?? null,
          },
          include: APPLICATION_INCLUDE,
        });
        await writeAudit(req, {
          action: 'application.decline',
          resource_type: 'Application',
          resource_id: id,
        });
        // Notify student (best-effort).
        const env = loadEnv();
        sendEmail({
          to: app.student.email,
          subject: 'Knox PSMS — application update',
          template: 'application-decision',
          user_id: app.student_user_id,
          event_type: 'application.declined',
          params: {
            student_name: app.student.full_name,
            opportunity_title: app.opportunity.title,
            organisation_name: app.opportunity.organisation.name,
            decision: 'DECLINE',
            decline_reason: body.decline_reason ?? '',
            next_steps_url: `${env.PUBLIC_WEB_ORIGIN}/student/applications/${id}`,
          },
        }).catch(() => undefined);
        return res.json(mapApplication(updated));
      }

      // APPROVE — find or create the supervisor user, create placement,
      // dispatch onboarding magic-link, notify student. All in one tx where
      // possible; magic-link issuance has its own DB write.
      const supervisor = await ensureSupervisorUser({
        email: app.opportunity.supervisor_email,
        full_name: app.opportunity.supervisor_name,
        organisation_id: app.opportunity.organisation_id,
      });

      const placement = await prisma.$transaction(async (tx) => {
        const updatedApp = await tx.application.update({
          where: { application_id: id },
          data: {
            status: 'APPROVED',
            decided_at: new Date(),
            decided_by_user_id: req.auth!.user_id,
          },
        });
        const created = await tx.placement.create({
          data: {
            application_id: updatedApp.application_id,
            student_user_id: updatedApp.student_user_id,
            opportunity_id: updatedApp.opportunity_id,
            supervisor_user_id: supervisor.user_id,
            start_date: app.opportunity.start_date,
            end_date: app.opportunity.end_date,
          },
        });
        return created;
      });

      await writeAudit(req, {
        action: 'application.approve',
        resource_type: 'Application',
        resource_id: id,
        after: { placement_id: placement.placement_id },
      });

      // Dispatch onboarding magic-link to supervisor (PRC-03 + PRC-07).
      const issued = await issueMagicLink({
        supervisor_user_id: supervisor.user_id,
        placement_id: placement.placement_id,
        purpose: 'ONBOARDING',
        issued_by_user_id: req.auth!.user_id,
      });
      sendEmail({
        to: supervisor.email,
        subject: 'Knox PSMS — supervisor onboarding',
        template: 'magic-link',
        user_id: supervisor.user_id,
        event_type: 'auth.magic_link.onboarding',
        params: {
          full_name: supervisor.full_name,
          purpose: 'ONBOARDING',
          link: buildMagicLinkUrl(issued.raw_token),
          ttl_hours: 24,
        },
      }).catch(() => undefined);

      const env = loadEnv();
      sendEmail({
        to: app.student.email,
        subject: 'Knox PSMS — application approved',
        template: 'application-decision',
        user_id: app.student_user_id,
        event_type: 'application.approved',
        params: {
          student_name: app.student.full_name,
          opportunity_title: app.opportunity.title,
          organisation_name: app.opportunity.organisation.name,
          decision: 'APPROVE',
          next_steps_url: `${env.PUBLIC_WEB_ORIGIN}/student/placements/${placement.placement_id}`,
        },
      }).catch(() => undefined);

      const fresh = await prisma.application.findUnique({
        where: { application_id: id },
        include: APPLICATION_INCLUDE,
      });
      res.json(mapApplication(fresh!));
    } catch (err) {
      next(err);
    }
  },
);

applicationsRouter.post('/:application_id/withdraw', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.application_id);
    const app = await prisma.application.findUnique({ where: { application_id: id } });
    if (!app) return sendProblem(res, Problems.notFound());
    if (app.student_user_id !== req.auth!.user_id) {
      return sendProblem(res, Problems.forbidden());
    }
    if (['APPROVED', 'DECLINED', 'WITHDRAWN'].includes(app.status)) {
      return sendProblem(res, Problems.unprocessable(`Cannot withdraw from status ${app.status}`));
    }
    const updated = await prisma.application.update({
      where: { application_id: id },
      data: { status: 'WITHDRAWN' },
      include: APPLICATION_INCLUDE,
    });
    await writeAudit(req, {
      action: 'application.withdraw',
      resource_type: 'Application',
      resource_id: id,
    });
    res.json(mapApplication(updated));
  } catch (err) {
    next(err);
  }
});

// ── helpers ────────────────────────────────────────────────────────────────

async function ensureSupervisorUser(input: {
  email: string;
  full_name: string;
  organisation_id: string;
}): Promise<{ user_id: string; email: string; full_name: string }> {
  const lower = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email_lower: lower } });
  if (existing) {
    if (existing.role !== 'SUPERVISOR') {
      throw Problems.conflict(
        `Email ${input.email} already registered with role ${existing.role}`,
      );
    }
    // Ensure supervisor profile is linked to this organisation.
    const profile = await prisma.supervisorProfile.findUnique({
      where: { user_id: existing.user_id },
    });
    if (!profile) {
      await prisma.supervisorProfile.create({
        data: { user_id: existing.user_id, organisation_id: input.organisation_id },
      });
    }
    return { user_id: existing.user_id, email: existing.email, full_name: existing.full_name };
  }
  // New supervisor — placeholder password (never used; supervisor auths via magic link only).
  const password_hash = await hashPassword(`supervisor-no-direct-login-${Date.now()}`);
  const created = await prisma.user.create({
    data: {
      email: input.email,
      email_lower: lower,
      full_name: input.full_name,
      role: 'SUPERVISOR',
      password_hash,
      supervisor_profile: {
        create: { organisation_id: input.organisation_id },
      },
    },
  });
  return { user_id: created.user_id, email: created.email, full_name: created.full_name };
}
