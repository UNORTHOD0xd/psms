// PRC-04 + PRC-05 — Service-hours ledger and eligibility endpoints.
//
// All queries are read-only and aggregate APPROVED HoursLog rows. There is
// no materialized ledger table; the per-student / per-placement totals are
// computed on demand. Postgres aggregates are fast enough at the pilot
// scale (hundreds of students × ~12 weekly logs each).

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { requireRole } from '../../middleware/require-role.js';

import { evaluateEligibility } from './eligibility.js';

export const ledgerRouter = Router();

// GET /me/ledger — student's own service-hours summary.
ledgerRouter.get('/me/ledger', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const summary = await computeStudentLedger(req.auth!.user_id);
    if (!summary) return sendProblem(res, Problems.notFound());
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// GET /students/:user_id/ledger — coordinator/admin view.
ledgerRouter.get(
  '/students/:user_id/ledger',
  requireRole('COORDINATOR_OR_ADMIN'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.user_id);
      const summary = await computeStudentLedger(id);
      if (!summary) return sendProblem(res, Problems.notFound());
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

// GET /placements/:id/ledger — per-placement breakdown (visible to anyone
// who can already see the placement).
ledgerRouter.get(
  '/placements/:placement_id/ledger',
  requireRole('ANY_AUTHENTICATED'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.placement_id);
      const placement = await prisma.placement.findUnique({ where: { placement_id: id } });
      if (!placement) return sendProblem(res, Problems.notFound());

      const role = req.auth!.role;
      const allowed =
        role === 'COORDINATOR' ||
        role === 'ADMINISTRATOR' ||
        (role === 'STUDENT' && placement.student_user_id === req.auth!.user_id) ||
        (role === 'SUPERVISOR' && placement.supervisor_user_id === req.auth!.user_id);
      if (!allowed) return sendProblem(res, Problems.forbidden());

      const grouped = await prisma.hoursLog.groupBy({
        by: ['status'],
        where: { placement_id: id },
        _sum: { hours: true },
        _count: { _all: true },
      });
      const totals = { APPROVED: 0, PENDING: 0, REJECTED: 0 };
      const counts = { APPROVED: 0, PENDING: 0, REJECTED: 0 };
      for (const g of grouped) {
        totals[g.status] = Number(g._sum.hours ?? 0);
        counts[g.status] = g._count._all;
      }
      res.json({
        placement_id: id,
        approved_hours: totals.APPROVED,
        pending_hours: totals.PENDING,
        rejected_hours: totals.REJECTED,
        approved_log_count: counts.APPROVED,
        pending_log_count: counts.PENDING,
        rejected_log_count: counts.REJECTED,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /me/eligibility — student's PRC-05 eligibility status.
ledgerRouter.get('/me/eligibility', requireRole('STUDENT'), async (req, res, next) => {
  try {
    const result = await computeStudentEligibility(req.auth!.user_id);
    if (!result) return sendProblem(res, Problems.notFound());
    res.json(result);
  } catch (err) {
    next(err);
  }
});

ledgerRouter.get(
  '/students/:user_id/eligibility',
  requireRole('COORDINATOR_OR_ADMIN'),
  async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.user_id);
      const result = await computeStudentEligibility(id);
      if (!result) return sendProblem(res, Problems.notFound());
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── Aggregators ────────────────────────────────────────────────────────────

async function computeStudentLedger(user_id: string) {
  const profile = await prisma.studentProfile.findUnique({
    where: { user_id },
    include: { programme: { select: { programme_code: true, name: true } } },
  });
  if (!profile) return null;

  const grouped = await prisma.hoursLog.groupBy({
    by: ['status'],
    where: { student_user_id: user_id },
    _sum: { hours: true },
  });
  const totals = { APPROVED: 0, PENDING: 0, REJECTED: 0 };
  for (const g of grouped) totals[g.status] = Number(g._sum.hours ?? 0);

  const placementCount = await prisma.placement.count({
    where: { student_user_id: user_id },
  });

  return {
    student_id: user_id,
    programme_code: profile.programme.programme_code,
    programme_name: profile.programme.name,
    hours_required: profile.hours_required,
    approved_hours: totals.APPROVED,
    pending_hours: totals.PENDING,
    rejected_hours: totals.REJECTED,
    hours_remaining: Math.max(profile.hours_required - totals.APPROVED, 0),
    placement_count: placementCount,
  };
}

async function computeStudentEligibility(user_id: string) {
  const profile = await prisma.studentProfile.findUnique({ where: { user_id } });
  if (!profile) return null;

  const approvedSum = await prisma.hoursLog.aggregate({
    where: { student_user_id: user_id, status: 'APPROVED' },
    _sum: { hours: true },
  });
  const completedCount = await prisma.placement.count({
    where: { student_user_id: user_id, status: 'COMPLETED' },
  });
  const finalCount = await prisma.evaluation.count({
    where: { evaluation_type: 'FINAL', placement: { student_user_id: user_id } },
  });

  return evaluateEligibility({
    hours_required: profile.hours_required,
    approved_hours: Number(approvedSum._sum.hours ?? 0),
    has_completed_placement: completedCount > 0,
    has_final_evaluation: finalCount > 0,
  });
}
