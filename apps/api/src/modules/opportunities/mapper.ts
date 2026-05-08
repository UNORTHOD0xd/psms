import type { Opportunity, Organisation, OpportunityCompetency, OpportunityProgramme, Competency, Programme } from '@prisma/client';

type OpportunityWithRelations = Opportunity & {
  organisation: Pick<Organisation, 'name'>;
  required_competencies: (OpportunityCompetency & { competency: Pick<Competency, 'competency_code'> })[];
  eligible_programmes: (OpportunityProgramme & { programme: Pick<Programme, 'programme_code'> })[];
};

export function mapOpportunity(o: OpportunityWithRelations) {
  return {
    opportunity_id: o.opportunity_id,
    organisation_id: o.organisation_id,
    organisation_name: o.organisation.name,
    title: o.title,
    description: o.description,
    start_date: o.start_date.toISOString().slice(0, 10),
    end_date: o.end_date.toISOString().slice(0, 10),
    min_hours: o.min_hours,
    openings: o.openings,
    status: o.status,
    application_deadline: o.application_deadline.toISOString().slice(0, 10),
    required_competencies: o.required_competencies.map((c) => c.competency.competency_code),
    eligible_programmes: o.eligible_programmes.map((p) => p.programme.programme_code),
    supervisor_name: o.supervisor_name,
    supervisor_email: o.supervisor_email,
    stipend_jmd: o.stipend_amount ? Number(o.stipend_amount) : null,
    created_at: o.created_at.toISOString(),
    updated_at: o.updated_at.toISOString(),
  };
}

export const OPPORTUNITY_INCLUDE = {
  organisation: { select: { name: true } },
  required_competencies: { include: { competency: { select: { competency_code: true } } } },
  eligible_programmes: { include: { programme: { select: { programme_code: true } } } },
} as const;
