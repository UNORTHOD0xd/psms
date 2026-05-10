// INP-03 — Opportunity authoring.
//
// State machine: DRAFT → PUBLISHED → CLOSED → ARCHIVED.
//   - Edits permitted only in DRAFT.
//   - Publish: DRAFT → PUBLISHED, sets published_at = now().
//   - Close:   PUBLISHED → CLOSED.
//
// Visibility:
//   - STUDENT: only PUBLISHED opportunities they are eligible for (programme).
//   - SUPERVISOR: opportunities tied to their placements.
//   - COORDINATOR/ADMIN: all.

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';

import { OPPORTUNITY_INCLUDE, mapOpportunity } from './mapper.js';

export const opportunitiesRouter = Router();

const OpportunityInputSchema = z.object({
  organisation_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  min_hours: z.number().int().min(1),
  openings: z.number().int().min(1).max(50),
  application_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  required_competencies: z.array(z.string()).default([]),
  eligible_programmes: z.array(z.string()).default([]),
  supervisor_name: z.string().min(1).max(200),
  supervisor_email: z.string().email(),
  stipend_jmd: z.number().nullable().optional(),
});

const ListQuerySchema = PaginationQuery.extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']).optional(),
  organisation_id: z.string().uuid().optional(),
  q: z.string().optional(),
});

async function visibilityFilter(
  auth: NonNullable<Express.Request['auth']>,
): Promise<Record<string, unknown>> {
  switch (auth.role) {
    case 'COORDINATOR':
    case 'ADMINISTRATOR':
      return {};
    case 'STUDENT': {
      const profile = await prisma.studentProfile.findUnique({
        where: { user_id: auth.user_id },
        include: { programme: true },
      });
      if (!profile) return { status: 'PUBLISHED', AND: [{ opportunity_id: '__none__' }] };
      return {
        status: 'PUBLISHED',
        OR: [
          { eligible_programmes: { none: {} } }, // open to all
          { eligible_programmes: { some: { programme_id: profile.programme_id } } },
        ],
      };
    }
    case 'SUPERVISOR': {
      const placements = await prisma.placement.findMany({
        where: { supervisor_user_id: auth.user_id },
        select: { opportunity_id: true },
      });
      const ids = placements.map((p) => p.opportunity_id);
      return ids.length ? { opportunity_id: { in: ids } } : { opportunity_id: '__none__' };
    }
  }
}

opportunitiesRouter.get('/', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const params = ListQuerySchema.parse(req.query);
    const visibility = await visibilityFilter(req.auth!);
    const sort = parseSort(
      params.sort,
      ['created_at', 'application_deadline', 'start_date'],
      { field: 'created_at', dir: 'desc' },
    );
    const where = {
      ...visibility,
      ...(params.status ? { status: params.status } : {}),
      ...(params.organisation_id ? { organisation_id: params.organisation_id } : {}),
      ...(params.q ? { title: { contains: params.q, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        include: OPPORTUNITY_INCLUDE,
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
      }),
      prisma.opportunity.count({ where }),
    ]);
    res.json(buildPage(params, rows.map(mapOpportunity), total));
  } catch (err) {
    next(err);
  }
});

opportunitiesRouter.post('/', requireRole('COORDINATOR'), async (req, res, next) => {
  try {
    const body = OpportunityInputSchema.parse(req.body);

    if (new Date(body.end_date) <= new Date(body.start_date)) {
      return sendProblem(res, Problems.unprocessable('end_date must be after start_date'));
    }
    if (new Date(body.application_deadline) > new Date(body.start_date)) {
      return sendProblem(
        res,
        Problems.unprocessable('application_deadline must be on or before start_date'),
      );
    }

    const competencies = body.required_competencies.length
      ? await prisma.competency.findMany({
          where: { competency_code: { in: body.required_competencies } },
        })
      : [];
    const programmes = body.eligible_programmes.length
      ? await prisma.programme.findMany({
          where: { programme_code: { in: body.eligible_programmes } },
        })
      : [];

    if (competencies.length !== body.required_competencies.length) {
      return sendProblem(res, Problems.badRequest('Unknown competency_code(s)'));
    }
    if (programmes.length !== body.eligible_programmes.length) {
      return sendProblem(res, Problems.badRequest('Unknown programme_code(s)'));
    }

    const created = await prisma.opportunity.create({
      data: {
        organisation_id: body.organisation_id,
        title: body.title,
        description: body.description,
        start_date: new Date(body.start_date),
        end_date: new Date(body.end_date),
        min_hours: body.min_hours,
        openings: body.openings,
        application_deadline: new Date(body.application_deadline),
        supervisor_name: body.supervisor_name,
        supervisor_email: body.supervisor_email,
        stipend_amount: body.stipend_jmd ?? null,
        stipend_currency: body.stipend_jmd ? 'JMD' : null,
        created_by_user_id: req.auth!.user_id,
        required_competencies: {
          create: competencies.map((c) => ({ competency_id: c.competency_id, weight: 1 })),
        },
        eligible_programmes: {
          create: programmes.map((p) => ({ programme_id: p.programme_id })),
        },
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeAudit(req, {
      action: 'opportunity.create',
      resource_type: 'Opportunity',
      resource_id: created.opportunity_id,
      after: { title: created.title, status: created.status },
    });

    res.status(201).json(mapOpportunity(created));
  } catch (err) {
    next(err);
  }
});

opportunitiesRouter.get('/:opportunity_id', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.opportunity_id);
    const visibility = await visibilityFilter(req.auth!);
    const row = await prisma.opportunity.findFirst({
      where: { opportunity_id: id, ...visibility },
      include: OPPORTUNITY_INCLUDE,
    });
    if (!row) return sendProblem(res, Problems.notFound());
    res.json(mapOpportunity(row));
  } catch (err) {
    next(err);
  }
});

opportunitiesRouter.patch('/:opportunity_id', requireRole('COORDINATOR'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.opportunity_id);
    const body = OpportunityInputSchema.partial().parse(req.body);
    const before = await prisma.opportunity.findUnique({
      where: { opportunity_id: id },
      include: OPPORTUNITY_INCLUDE,
    });
    if (!before) return sendProblem(res, Problems.notFound());
    if (before.status !== 'DRAFT') {
      return sendProblem(
        res,
        Problems.unprocessable(`Cannot edit opportunity in status ${before.status}`),
      );
    }

    const {
      stipend_jmd,
      start_date,
      end_date,
      application_deadline,
      required_competencies: _rc,
      eligible_programmes: _ep,
      ...rest
    } = body;
    const updated = await prisma.opportunity.update({
      where: { opportunity_id: id },
      data: {
        ...rest,
        ...(start_date ? { start_date: new Date(start_date) } : {}),
        ...(end_date ? { end_date: new Date(end_date) } : {}),
        ...(application_deadline ? { application_deadline: new Date(application_deadline) } : {}),
        ...(stipend_jmd !== undefined
          ? {
              stipend_amount: stipend_jmd,
              stipend_currency: stipend_jmd ? 'JMD' : null,
            }
          : {}),
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeAudit(req, {
      action: 'opportunity.update',
      resource_type: 'Opportunity',
      resource_id: id,
      before: { title: before.title, status: before.status },
      after: { title: updated.title, status: updated.status },
    });

    res.json(mapOpportunity(updated));
  } catch (err) {
    next(err);
  }
});

opportunitiesRouter.post('/:opportunity_id/publish', requireRole('COORDINATOR'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.opportunity_id);
    const before = await prisma.opportunity.findUnique({
      where: { opportunity_id: id },
      include: OPPORTUNITY_INCLUDE,
    });
    if (!before) return sendProblem(res, Problems.notFound());
    if (before.status !== 'DRAFT') {
      return sendProblem(res, Problems.unprocessable(`Cannot publish from status ${before.status}`));
    }
    const updated = await prisma.opportunity.update({
      where: { opportunity_id: id },
      data: { status: 'PUBLISHED', published_at: new Date() },
      include: OPPORTUNITY_INCLUDE,
    });
    await writeAudit(req, {
      action: 'opportunity.publish',
      resource_type: 'Opportunity',
      resource_id: id,
    });
    res.json(mapOpportunity(updated));
  } catch (err) {
    next(err);
  }
});

opportunitiesRouter.post('/:opportunity_id/close', requireRole('COORDINATOR'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.opportunity_id);
    const before = await prisma.opportunity.findUnique({
      where: { opportunity_id: id },
      include: OPPORTUNITY_INCLUDE,
    });
    if (!before) return sendProblem(res, Problems.notFound());
    if (before.status !== 'PUBLISHED') {
      return sendProblem(res, Problems.unprocessable(`Cannot close from status ${before.status}`));
    }
    const updated = await prisma.opportunity.update({
      where: { opportunity_id: id },
      data: { status: 'CLOSED', closed_at: new Date() },
      include: OPPORTUNITY_INCLUDE,
    });
    await writeAudit(req, {
      action: 'opportunity.close',
      resource_type: 'Opportunity',
      resource_id: id,
    });
    res.json(mapOpportunity(updated));
  } catch (err) {
    next(err);
  }
});
