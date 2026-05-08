// PRC-05 — Graduation eligibility check.
//
// A student is ELIGIBLE for the certificate when ALL of these are true:
//   1. Sum of APPROVED hours across all their placements ≥ hours_required.
//   2. At least one placement has reached COMPLETED.
//   3. That completed placement has a FINAL evaluation on file.
//
// ELIGIBLE_WITH_CAUTION: items 2 and 3 are satisfied but the student is
// 80–99% of the way to hours_required (lets the coordinator nudge them).
//
// INELIGIBLE: anything else.
//
// This file holds the pure logic; the HTTP wrapper lives in router.ts.

export type EligibilityStatus = 'ELIGIBLE' | 'ELIGIBLE_WITH_CAUTION' | 'INELIGIBLE';

export interface EligibilityInput {
  hours_required: number;
  approved_hours: number;
  has_completed_placement: boolean;
  has_final_evaluation: boolean;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  approved_hours: number;
  hours_required: number;
  hours_remaining: number;
  has_completed_placement: boolean;
  has_final_evaluation: boolean;
  reasons: string[];
}

const CAUTION_FLOOR = 0.8;

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  const remaining = Math.max(input.hours_required - input.approved_hours, 0);

  if (input.approved_hours < input.hours_required) {
    reasons.push(
      `Short by ${remaining} approved hours (have ${input.approved_hours}, need ${input.hours_required})`,
    );
  }
  if (!input.has_completed_placement) {
    reasons.push('No placement has reached COMPLETED status');
  }
  if (!input.has_final_evaluation) {
    reasons.push('No FINAL evaluation has been submitted');
  }

  let status: EligibilityStatus;
  if (reasons.length === 0) {
    status = 'ELIGIBLE';
  } else if (
    input.has_completed_placement &&
    input.has_final_evaluation &&
    input.approved_hours >= input.hours_required * CAUTION_FLOOR
  ) {
    status = 'ELIGIBLE_WITH_CAUTION';
  } else {
    status = 'INELIGIBLE';
  }

  return {
    status,
    approved_hours: input.approved_hours,
    hours_required: input.hours_required,
    hours_remaining: remaining,
    has_completed_placement: input.has_completed_placement,
    has_final_evaluation: input.has_final_evaluation,
    reasons,
  };
}
