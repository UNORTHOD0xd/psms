import type { Application, Opportunity, Organisation } from '@prisma/client';

type AppWithRelations = Application & {
  opportunity: Pick<Opportunity, 'title' | 'organisation_id'> & {
    organisation: Pick<Organisation, 'name'>;
  };
};

export function mapApplication(a: AppWithRelations) {
  return {
    application_id: a.application_id,
    student_id: a.student_user_id,
    opportunity_id: a.opportunity_id,
    opportunity_title: a.opportunity.title,
    organisation_name: a.opportunity.organisation.name,
    motivation: a.motivation,
    cv_url: a.cv_url,
    status: a.status,
    submitted_at: a.submitted_at.toISOString(),
    decided_at: a.decided_at ? a.decided_at.toISOString() : null,
    decline_reason: a.decline_reason,
    score: a.score_snapshot ? Number(a.score_snapshot) : undefined,
  };
}

export const APPLICATION_INCLUDE = {
  opportunity: {
    select: {
      title: true,
      organisation_id: true,
      organisation: { select: { name: true } },
    },
  },
} as const;
