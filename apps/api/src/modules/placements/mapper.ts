import type {
  Placement,
  Opportunity,
  Organisation,
  User,
  HoursLog,
  SiteVisitNote,
  SiteVisitFollowUp,
} from '@prisma/client';

type PlacementWithRelations = Placement & {
  opportunity: Pick<Opportunity, 'title' | 'organisation_id'> & {
    organisation: Pick<Organisation, 'name'>;
  };
  student: Pick<User, 'full_name' | 'email'>;
  supervisor: Pick<User, 'full_name' | 'email'>;
};

export function mapPlacement(p: PlacementWithRelations) {
  return {
    placement_id: p.placement_id,
    application_id: p.application_id,
    opportunity_id: p.opportunity_id,
    opportunity_title: p.opportunity.title,
    organisation_name: p.opportunity.organisation.name,
    student_id: p.student_user_id,
    student_name: p.student.full_name,
    supervisor_id: p.supervisor_user_id,
    supervisor_name: p.supervisor.full_name,
    status: p.status,
    start_date: p.start_date.toISOString().slice(0, 10),
    end_date: p.end_date.toISOString().slice(0, 10),
    composite_rating: p.composite_rating ? Number(p.composite_rating) : null,
    terminated_reason: p.terminated_reason,
    created_at: p.created_at.toISOString(),
  };
}

export const PLACEMENT_INCLUDE = {
  opportunity: {
    select: {
      title: true,
      organisation_id: true,
      organisation: { select: { name: true } },
    },
  },
  student: { select: { full_name: true, email: true } },
  supervisor: { select: { full_name: true, email: true } },
} as const;

export function mapHoursLog(h: HoursLog) {
  return {
    log_id: h.log_id,
    placement_id: h.placement_id,
    week_number: h.week_number,
    date: h.date.toISOString().slice(0, 10),
    hours: Number(h.hours),
    activity_narrative: h.activity_narrative,
    status: h.status,
    approved_at: h.approved_at ? h.approved_at.toISOString() : null,
    rejection_comment: h.rejection_comment,
    created_at: h.created_at.toISOString(),
  };
}

type SiteVisitWithFollowUps = SiteVisitNote & {
  follow_up_actions: SiteVisitFollowUp[];
};

export function mapSiteVisit(v: SiteVisitWithFollowUps) {
  return {
    note_id: v.note_id,
    placement_id: v.placement_id,
    coordinator_id: v.coordinator_user_id,
    visit_date: v.visit_date.toISOString().slice(0, 10),
    narrative: v.narrative,
    overall_assessment: v.overall_assessment,
    follow_up_actions: v.follow_up_actions.map((f) => ({
      followup_id: f.followup_id,
      action: f.action,
      due_date: f.due_date.toISOString().slice(0, 10),
      resolved_at: f.resolved_at ? f.resolved_at.toISOString() : null,
    })),
    created_at: v.created_at.toISOString(),
  };
}
