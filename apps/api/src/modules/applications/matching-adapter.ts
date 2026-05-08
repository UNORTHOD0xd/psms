// Adapters that translate Prisma rows into the pure shapes consumed by
// PRC-02 (`packages/shared/src/matching.ts`). Keeping these adapters out of
// the matching module keeps the scorer independent of Prisma.

import type {
  StudentProfileForMatching,
  OpportunityForMatching,
} from '@psms/shared';

import { prisma } from '../../lib/prisma.js';

export async function loadStudentForMatching(
  user_id: string,
): Promise<StudentProfileForMatching | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { user_id },
    include: {
      programme: { select: { programme_code: true } },
      competencies: { include: { competency: { select: { competency_code: true } } } },
    },
  });
  if (!profile) return null;
  return {
    programme_code: profile.programme.programme_code,
    expected_grad_date: profile.expected_grad_date,
    competencies: profile.competencies.map((c) => ({
      competency_code: c.competency.competency_code,
      proficiency: c.proficiency,
    })),
  };
}

export async function loadPublishedOpportunitiesForMatching(): Promise<OpportunityForMatching[]> {
  const rows = await prisma.opportunity.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      required_competencies: {
        include: { competency: { select: { competency_code: true } } },
      },
      eligible_programmes: {
        include: { programme: { select: { programme_code: true } } },
      },
    },
  });
  return rows.map((r) => ({
    opportunity_id: r.opportunity_id,
    start_date: r.start_date,
    end_date: r.end_date,
    min_hours: r.min_hours,
    application_deadline: r.application_deadline,
    published_at: r.published_at,
    required_competencies: r.required_competencies.map((c) => ({
      competency_code: c.competency.competency_code,
      weight: Number(c.weight),
    })),
    eligible_programmes: r.eligible_programmes.map((p) => p.programme.programme_code),
  }));
}
