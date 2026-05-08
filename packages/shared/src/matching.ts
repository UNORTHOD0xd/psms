// PRC-02 — Rule-based opportunity scorer.
//
// Composite score in [0, 1]:
//   0.40 × competency_overlap
//   0.25 × programme_match
//   0.20 × availability_fit
//   0.15 × freshness
//
// Pure: identical inputs always yield identical outputs. No I/O, no clocks
// except via the explicit `now` parameter, no Date.now(). This is what makes
// the scorer testable and what the e2e UAT scripts rely on.

export const WEIGHTS = {
  competency_overlap: 0.4,
  programme_match: 0.25,
  availability_fit: 0.2,
  freshness: 0.15,
} as const;

// Sanity check at module load — must always sum to exactly 1.
const _weight_sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_weight_sum - 1) > 1e-9) {
  throw new Error(`PRC-02 weights must sum to 1, got ${_weight_sum}`);
}

export interface StudentProfileForMatching {
  programme_code: string;
  expected_grad_date: Date | null;
  // Self-declared competencies. proficiency is 1..5.
  competencies: ReadonlyArray<{ competency_code: string; proficiency: number }>;
}

export interface OpportunityForMatching {
  opportunity_id: string;
  start_date: Date;
  end_date: Date;
  min_hours: number;
  application_deadline: Date;
  // ISO datetime when the opportunity transitioned to PUBLISHED. Null = DRAFT.
  published_at: Date | null;
  // Required competencies and per-competency weight (0..1, default 1).
  required_competencies: ReadonlyArray<{ competency_code: string; weight: number }>;
  // Programme codes eligible to apply. Empty array = open to all programmes.
  eligible_programmes: ReadonlyArray<string>;
}

export interface ScoreFactors {
  competency_overlap: number;
  programme_match: number;
  availability_fit: number;
  freshness: number;
}

export interface ScoreResult {
  score: number;
  factors: ScoreFactors;
}

// ─── Factor: competency_overlap ────────────────────────────────────────────
// Weighted fraction of the opportunity's required competencies that the
// student declares, scaled by proficiency.
//
// Each required competency contributes (proficiency / 5) × weight. The total
// is divided by the sum of weights so the result lives in [0, 1].
//
// If the opportunity has no required competencies, returns 1.
export function competencyOverlap(
  student: Pick<StudentProfileForMatching, 'competencies'>,
  opportunity: Pick<OpportunityForMatching, 'required_competencies'>,
): number {
  const required = opportunity.required_competencies;
  if (required.length === 0) return 1;

  const declared = new Map(
    student.competencies.map((c) => [c.competency_code, clamp(c.proficiency, 0, 5)]),
  );

  let totalWeight = 0;
  let matchedWeight = 0;
  for (const req of required) {
    const w = clamp(req.weight, 0, 1);
    totalWeight += w;
    const prof = declared.get(req.competency_code);
    if (prof !== undefined) {
      matchedWeight += w * (prof / 5);
    }
  }
  if (totalWeight === 0) return 1;
  return clamp(matchedWeight / totalWeight, 0, 1);
}

// ─── Factor: programme_match ───────────────────────────────────────────────
// 1 if the student's programme is listed (or the opportunity is open to all),
// else 0. Binary because programme eligibility is a hard rule expressed in
// the policy: a student outside the eligible set should not be matched
// regardless of any other factor.
export function programmeMatch(
  student: Pick<StudentProfileForMatching, 'programme_code'>,
  opportunity: Pick<OpportunityForMatching, 'eligible_programmes'>,
): 0 | 1 {
  if (opportunity.eligible_programmes.length === 0) return 1;
  return opportunity.eligible_programmes.includes(student.programme_code) ? 1 : 0;
}

// ─── Factor: availability_fit ──────────────────────────────────────────────
// How well the opportunity fits the student's remaining academic window.
//
//   • If the student has no expected_grad_date, defaults to 0.5 (neutral —
//     we lack the data to score, but don't disqualify).
//   • If the student's expected graduation is before the opportunity ends,
//     the placement cannot complete on time → 0.
//   • Otherwise the score is min(1, (weeks_until_grad - opp_weeks) / opp_weeks),
//     so a placement that occupies the entire remaining window scores 0,
//     and one that leaves at least an equal-length buffer scores 1.
export function availabilityFit(
  student: Pick<StudentProfileForMatching, 'expected_grad_date'>,
  opportunity: Pick<OpportunityForMatching, 'start_date' | 'end_date'>,
): number {
  if (!student.expected_grad_date) return 0.5;

  const oppMs = opportunity.end_date.getTime() - opportunity.start_date.getTime();
  if (oppMs <= 0) return 0;

  const gradMs = student.expected_grad_date.getTime() - opportunity.start_date.getTime();
  if (gradMs < oppMs) return 0; // graduates before the placement ends

  const oppWeeks = oppMs / WEEK_MS;
  const gradWeeks = gradMs / WEEK_MS;
  const buffer = gradWeeks - oppWeeks;

  // 0 buffer → 0; buffer ≥ oppWeeks → 1; linear in between.
  return clamp(buffer / oppWeeks, 0, 1);
}

// ─── Factor: freshness ─────────────────────────────────────────────────────
// Linear decay from 1.0 on the day of publication to 0.0 at FRESHNESS_HORIZON_DAYS.
// Unpublished opportunities (published_at = null) score 0.
export const FRESHNESS_HORIZON_DAYS = 30;

export function freshness(
  opportunity: Pick<OpportunityForMatching, 'published_at'>,
  now: Date,
): number {
  if (!opportunity.published_at) return 0;
  const ageMs = now.getTime() - opportunity.published_at.getTime();
  if (ageMs < 0) return 1; // future-dated publication, treat as fresh
  const ageDays = ageMs / DAY_MS;
  return clamp(1 - ageDays / FRESHNESS_HORIZON_DAYS, 0, 1);
}

// ─── Composite scorer ──────────────────────────────────────────────────────

export function scoreOpportunity(
  student: StudentProfileForMatching,
  opportunity: OpportunityForMatching,
  now: Date,
): ScoreResult {
  const factors: ScoreFactors = {
    competency_overlap: competencyOverlap(student, opportunity),
    programme_match: programmeMatch(student, opportunity),
    availability_fit: availabilityFit(student, opportunity),
    freshness: freshness(opportunity, now),
  };

  const score =
    WEIGHTS.competency_overlap * factors.competency_overlap +
    WEIGHTS.programme_match * factors.programme_match +
    WEIGHTS.availability_fit * factors.availability_fit +
    WEIGHTS.freshness * factors.freshness;

  return { score: clamp(score, 0, 1), factors };
}

export function rankOpportunities(
  student: StudentProfileForMatching,
  opportunities: ReadonlyArray<OpportunityForMatching>,
  now: Date,
  topN?: number,
): ReadonlyArray<{ opportunity_id: string; score: number; factors: ScoreFactors }> {
  const ranked = opportunities
    .map((o) => ({ opportunity_id: o.opportunity_id, ...scoreOpportunity(student, o, now) }))
    .sort((a, b) => b.score - a.score);
  return topN === undefined ? ranked : ranked.slice(0, topN);
}

// ─── Internals ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
