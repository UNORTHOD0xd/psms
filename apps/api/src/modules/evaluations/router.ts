// INP-06 + PRC-08 — Supervisor evaluations (midterm and final).
//
// Submission rules:
//   - MIDTERM: requires placement.status = ACTIVE.
//   - FINAL:   requires placement.status = ACTIVE; on submission the
//              placement transitions to COMPLETED and composite_rating is
//              recomputed (PRC-08).
//   - Only the assigned supervisor or a coordinator may submit.
//   - One evaluation per (placement, evaluation_type). Re-submission is
//     allowed for the SAME type only when the prior row is missing — the DB
//     unique index enforces this.

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';
import { sendEmail } from '../notifications/email.js';

import { generateForPlacement } from '../certificates/service.js';
import { logger } from '../../lib/logger.js';

import { evaluationAverage, placementComposite } from './aggregator.js';
import { EVALUATION_INCLUDE, mapEvaluation } from './mapper.js';

export const evaluationsRouter = Router();

const EvaluationInputSchema = z.object({
  placement_id: z.string().uuid(),
  evaluation_type: z.enum(['MIDTERM', 'FINAL']),
  attendance_rating: z.number().int().min(1).max(5),
  professionalism_rating: z.number().int().min(1).max(5),
  narrative: z.string().min(20).max(4000),
  recommend_future: z.boolean(),
  competency_ratings: z
    .array(
      z.object({
        competency_code: z.string(),
        rating: z.number().int().min(1).max(5),
      }),
    )
    .default([]),
});

evaluationsRouter.get('/', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const placement_id = z.string().uuid().parse(req.query.placement_id);

    const placement = await prisma.placement.findUnique({
      where: { placement_id },
    });
    if (!placement) return sendProblem(res, Problems.notFound());

    const role = req.auth!.role;
    const isOwner =
      (role === 'STUDENT' && placement.student_user_id === req.auth!.user_id) ||
      (role === 'SUPERVISOR' && placement.supervisor_user_id === req.auth!.user_id) ||
      role === 'COORDINATOR' ||
      role === 'ADMINISTRATOR';
    if (!isOwner) return sendProblem(res, Problems.forbidden());

    const rows = await prisma.evaluation.findMany({
      where: { placement_id },
      include: EVALUATION_INCLUDE,
      orderBy: { submitted_at: 'asc' },
    });
    res.json(rows.map(mapEvaluation));
  } catch (err) {
    next(err);
  }
});

evaluationsRouter.post('/', requireRole('ANY_AUTHENTICATED'), async (req, res, next) => {
  try {
    const body = EvaluationInputSchema.parse(req.body);

    const placement = await prisma.placement.findUnique({
      where: { placement_id: body.placement_id },
      include: { student: true, opportunity: { select: { title: true } } },
    });
    if (!placement) return sendProblem(res, Problems.notFound());

    const isAssignedSupervisor =
      req.auth!.role === 'SUPERVISOR' && placement.supervisor_user_id === req.auth!.user_id;
    const isCoordinator =
      req.auth!.role === 'COORDINATOR' || req.auth!.role === 'ADMINISTRATOR';
    if (!isAssignedSupervisor && !isCoordinator) {
      return sendProblem(res, Problems.forbidden('Not the assigned supervisor'));
    }

    if (placement.status !== 'ACTIVE') {
      return sendProblem(
        res,
        Problems.unprocessable(`Cannot submit evaluation while placement is ${placement.status}`),
      );
    }

    // Resolve competency codes → ids.
    const competencies = body.competency_ratings.length
      ? await prisma.competency.findMany({
          where: { competency_code: { in: body.competency_ratings.map((c) => c.competency_code) } },
        })
      : [];
    if (competencies.length !== body.competency_ratings.length) {
      return sendProblem(res, Problems.badRequest('Unknown competency_code(s)'));
    }
    const codeToId = new Map(competencies.map((c) => [c.competency_code, c.competency_id]));

    const average_score = evaluationAverage({
      evaluation_type: body.evaluation_type,
      attendance_rating: body.attendance_rating,
      professionalism_rating: body.professionalism_rating,
      competency_ratings: body.competency_ratings.map((c) => c.rating),
    });

    try {
      const created = await prisma.$transaction(async (tx) => {
        const evaluation = await tx.evaluation.create({
          data: {
            placement_id: body.placement_id,
            evaluation_type: body.evaluation_type,
            attendance_rating: body.attendance_rating,
            professionalism_rating: body.professionalism_rating,
            narrative: body.narrative,
            recommend_future: body.recommend_future,
            submitted_by_user_id: req.auth!.user_id,
            average_score,
            competency_ratings: {
              create: body.competency_ratings.map((c) => ({
                competency_id: codeToId.get(c.competency_code)!,
                rating: c.rating,
              })),
            },
          },
          include: EVALUATION_INCLUDE,
        });

        // Recompute the placement composite from all submitted evaluations.
        const all = await tx.evaluation.findMany({
          where: { placement_id: body.placement_id },
          select: { average_score: true },
        });
        const composite = placementComposite(all.map((e) => Number(e.average_score)));

        await tx.placement.update({
          where: { placement_id: body.placement_id },
          data: {
            composite_rating: composite,
            ...(body.evaluation_type === 'FINAL' ? { status: 'COMPLETED' } : {}),
          },
        });

        return evaluation;
      });

      await writeAudit(req, {
        action: `evaluation.${body.evaluation_type.toLowerCase()}.submit`,
        resource_type: 'Evaluation',
        resource_id: created.evaluation_id,
        after: { average_score: Number(created.average_score) },
      });

      // Notify the student.
      sendEmail({
        to: placement.student.email,
        subject:
          body.evaluation_type === 'FINAL'
            ? 'Knox PSMS — final evaluation received'
            : 'Knox PSMS — midterm evaluation received',
        template: 'evaluation-reminder',
        user_id: placement.student_user_id,
        event_type: `evaluation.${body.evaluation_type.toLowerCase()}.received`,
        params: {
          student_name: placement.student.full_name,
          evaluation_type: body.evaluation_type,
          opportunity_title: placement.opportunity.title,
        },
      }).catch(() => undefined);

      // PRC-06: a FINAL evaluation transitions the placement to COMPLETED
      // and triggers certificate generation if the student is eligible.
      // Best-effort: failures don't block the evaluation submission. The
      // certificate row is the single observable artefact a downstream
      // poll can wait on.
      if (body.evaluation_type === 'FINAL') {
        generateForPlacement({ placement_id: body.placement_id })
          .catch((err) =>
            logger.warn(
              { err, placement_id: body.placement_id },
              'certificate generation deferred',
            ),
          );
      }

      res.status(201).json(mapEvaluation(created));
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return sendProblem(
          res,
          Problems.conflict(`A ${body.evaluation_type} evaluation already exists for this placement`),
        );
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});
