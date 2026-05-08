import { describe, it, expect } from 'vitest';

import { evaluateEligibility } from '../../src/modules/ledger/eligibility.js';

describe('PRC-05 evaluateEligibility', () => {
  it('returns ELIGIBLE when all three gates pass', () => {
    const r = evaluateEligibility({
      hours_required: 180,
      approved_hours: 180,
      has_completed_placement: true,
      has_final_evaluation: true,
    });
    expect(r.status).toBe('ELIGIBLE');
    expect(r.hours_remaining).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it('returns ELIGIBLE_WITH_CAUTION at 80–99% of required hours when gates 2+3 pass', () => {
    const r = evaluateEligibility({
      hours_required: 180,
      approved_hours: 150,
      has_completed_placement: true,
      has_final_evaluation: true,
    });
    expect(r.status).toBe('ELIGIBLE_WITH_CAUTION');
    expect(r.hours_remaining).toBe(30);
  });

  it('returns INELIGIBLE when hours below 80% even if other gates pass', () => {
    const r = evaluateEligibility({
      hours_required: 180,
      approved_hours: 100,
      has_completed_placement: true,
      has_final_evaluation: true,
    });
    expect(r.status).toBe('INELIGIBLE');
  });

  it('returns INELIGIBLE when no completed placement', () => {
    const r = evaluateEligibility({
      hours_required: 180,
      approved_hours: 200,
      has_completed_placement: false,
      has_final_evaluation: false,
    });
    expect(r.status).toBe('INELIGIBLE');
    expect(r.reasons).toContain('No placement has reached COMPLETED status');
  });

  it('lists every reason that fails', () => {
    const r = evaluateEligibility({
      hours_required: 180,
      approved_hours: 50,
      has_completed_placement: false,
      has_final_evaluation: false,
    });
    expect(r.reasons.length).toBe(3);
  });

  it('reports hours_remaining as 0 when over-credited', () => {
    const r = evaluateEligibility({
      hours_required: 180,
      approved_hours: 250,
      has_completed_placement: true,
      has_final_evaluation: true,
    });
    expect(r.hours_remaining).toBe(0);
  });
});
