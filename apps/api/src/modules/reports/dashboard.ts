// PRC-09 — Coordinator dashboard aggregation.
//
// Pure-ish: takes the Prisma client and returns the dashboard payload.
// All counts are computed on demand with bounded query plans (every
// query is indexed). PRF-07 budget: ≤ 2 s p95 on the pilot fixture.

import type { PrismaClient } from '@prisma/client';

const SOON_DAYS = 14;
const RISK_DAYS = 60;
const RISK_THRESHOLD = 0.5;

export interface CoordinatorDashboard {
  active_placements: number;
  pending_hours_logs: number;
  pending_hours_total: number;
  applications_pending: number;
  evaluations_due_soon: number;
  students_at_risk: number;
  opportunities_by_status: Record<'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED', number>;
  generated_at: string;
}

export async function buildCoordinatorDashboard(
  prisma: PrismaClient,
): Promise<CoordinatorDashboard> {
  const now = new Date();
  const soonCutoff = new Date(now.getTime() + SOON_DAYS * 24 * 60 * 60 * 1000);
  const riskCutoff = new Date(now.getTime() + RISK_DAYS * 24 * 60 * 60 * 1000);

  const [
    activePlacements,
    pendingHoursAgg,
    pendingApplications,
    finalsDue,
    activePlacementsForRisk,
    oppsByStatus,
  ] = await Promise.all([
    prisma.placement.count({ where: { status: 'ACTIVE' } }),
    prisma.hoursLog.aggregate({
      where: { status: 'PENDING' },
      _count: { _all: true },
      _sum: { hours: true },
    }),
    prisma.application.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    // FINAL evaluations due: ACTIVE placements whose end_date is within
    // SOON_DAYS and which lack a FINAL evaluation.
    prisma.placement.count({
      where: {
        status: 'ACTIVE',
        end_date: { lte: soonCutoff },
        evaluations: { none: { evaluation_type: 'FINAL' } },
      },
    }),
    prisma.placement.findMany({
      where: { status: 'ACTIVE', end_date: { lte: riskCutoff } },
      select: { placement_id: true, student_user_id: true, end_date: true },
    }),
    prisma.opportunity.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  // Students at risk — per placement, fetch approved hours and required
  // hours, decide if percent_complete < threshold. Bounded by the small
  // count returned by activePlacementsForRisk in the pilot.
  let students_at_risk = 0;
  for (const p of activePlacementsForRisk) {
    const profile = await prisma.studentProfile.findUnique({
      where: { user_id: p.student_user_id },
      select: { hours_required: true },
    });
    if (!profile || profile.hours_required <= 0) continue;
    const sum = await prisma.hoursLog.aggregate({
      where: { student_user_id: p.student_user_id, status: 'APPROVED' },
      _sum: { hours: true },
    });
    const approved = Number(sum._sum.hours ?? 0);
    if (approved / profile.hours_required < RISK_THRESHOLD) students_at_risk += 1;
  }

  const oppCounts: CoordinatorDashboard['opportunities_by_status'] = {
    DRAFT: 0,
    PUBLISHED: 0,
    CLOSED: 0,
    ARCHIVED: 0,
  };
  for (const row of oppsByStatus) oppCounts[row.status] = row._count._all;

  return {
    active_placements: activePlacements,
    pending_hours_logs: pendingHoursAgg._count._all,
    pending_hours_total: Number(pendingHoursAgg._sum.hours ?? 0),
    applications_pending: pendingApplications,
    evaluations_due_soon: finalsDue,
    students_at_risk,
    opportunities_by_status: oppCounts,
    generated_at: now.toISOString(),
  };
}
