import { describe, expect, it } from 'vitest';

import {
  FRESHNESS_HORIZON_DAYS,
  WEIGHTS,
  availabilityFit,
  competencyOverlap,
  freshness,
  programmeMatch,
  rankOpportunities,
  scoreOpportunity,
  type OpportunityForMatching,
  type StudentProfileForMatching,
} from '../src/matching.js';

const NOW = new Date('2026-05-02T12:00:00Z');

const baseStudent = (overrides: Partial<StudentProfileForMatching> = {}): StudentProfileForMatching => ({
  programme_code: 'ICT-DIP',
  expected_grad_date: new Date('2027-06-30'),
  competencies: [
    { competency_code: 'PROG-WEB', proficiency: 4 },
    { competency_code: 'PROG-DB', proficiency: 3 },
  ],
  ...overrides,
});

const baseOpp = (overrides: Partial<OpportunityForMatching> = {}): OpportunityForMatching => ({
  opportunity_id: 'opp-1',
  start_date: new Date('2026-06-01'),
  end_date: new Date('2026-08-31'), // ~13 weeks
  min_hours: 120,
  application_deadline: new Date('2026-05-25'),
  published_at: new Date('2026-04-25T12:00:00Z'), // 7 days before NOW
  required_competencies: [
    { competency_code: 'PROG-WEB', weight: 1 },
    { competency_code: 'PROG-DB', weight: 1 },
  ],
  eligible_programmes: ['ICT-DIP', 'CS-BSC'],
  ...overrides,
});

describe('PRC-02 weights', () => {
  it('sum to exactly 1.0 — accreditation invariant', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('match the documented composition (0.40 / 0.25 / 0.20 / 0.15)', () => {
    expect(WEIGHTS.competency_overlap).toBe(0.4);
    expect(WEIGHTS.programme_match).toBe(0.25);
    expect(WEIGHTS.availability_fit).toBe(0.2);
    expect(WEIGHTS.freshness).toBe(0.15);
  });
});

// ─── competency_overlap ─────────────────────────────────────────────────────

describe('competencyOverlap', () => {
  it('returns 1 when no competencies are required', () => {
    expect(
      competencyOverlap(baseStudent(), { required_competencies: [] }),
    ).toBe(1);
  });

  it('returns 1 when all required competencies are declared at proficiency 5', () => {
    const student = baseStudent({
      competencies: [
        { competency_code: 'PROG-WEB', proficiency: 5 },
        { competency_code: 'PROG-DB', proficiency: 5 },
      ],
    });
    expect(competencyOverlap(student, baseOpp())).toBe(1);
  });

  it('returns 0 when the student declares none of the required competencies', () => {
    const student = baseStudent({ competencies: [] });
    expect(competencyOverlap(student, baseOpp())).toBe(0);
  });

  it('scales by proficiency (4/5 + 3/5 averaged → 0.7)', () => {
    expect(competencyOverlap(baseStudent(), baseOpp())).toBeCloseTo(0.7, 5);
  });

  it('honours per-competency weight', () => {
    const opp = baseOpp({
      required_competencies: [
        { competency_code: 'PROG-WEB', weight: 1 }, // student has prof 4
        { competency_code: 'PROG-DB', weight: 0.5 }, // student has prof 3
      ],
    });
    // weighted: (1×4/5 + 0.5×3/5) / (1 + 0.5) = (0.8 + 0.3) / 1.5 = 0.7333
    expect(competencyOverlap(baseStudent(), opp)).toBeCloseTo(0.7333, 3);
  });

  it('clamps proficiencies into [0, 5]', () => {
    const student = baseStudent({
      competencies: [
        { competency_code: 'PROG-WEB', proficiency: 99 },
        { competency_code: 'PROG-DB', proficiency: -3 },
      ],
    });
    // (5/5 + 0/5) / 2 = 0.5
    expect(competencyOverlap(student, baseOpp())).toBeCloseTo(0.5, 5);
  });
});

// ─── programme_match ────────────────────────────────────────────────────────

describe('programmeMatch', () => {
  it('returns 1 when the student programme is in the eligible set', () => {
    expect(programmeMatch({ programme_code: 'ICT-DIP' }, baseOpp())).toBe(1);
  });

  it('returns 0 when the student programme is not in the eligible set', () => {
    expect(programmeMatch({ programme_code: 'NET-CERT' }, baseOpp())).toBe(0);
  });

  it('returns 1 when the eligible_programmes list is empty (open to all)', () => {
    expect(
      programmeMatch({ programme_code: 'ANYTHING' }, { eligible_programmes: [] }),
    ).toBe(1);
  });
});

// ─── availability_fit ───────────────────────────────────────────────────────

describe('availabilityFit', () => {
  it('returns 0.5 when expected_grad_date is unknown', () => {
    expect(availabilityFit({ expected_grad_date: null }, baseOpp())).toBe(0.5);
  });

  it('returns 0 when the student graduates before the placement ends', () => {
    const student = baseStudent({ expected_grad_date: new Date('2026-07-15') });
    expect(availabilityFit(student, baseOpp())).toBe(0);
  });

  it('returns 1 when the buffer after the placement is at least its own length', () => {
    // opp: Jun 1 → Aug 31 (≈13 weeks). grad: 2027-06-30 (≈56 weeks after start).
    // buffer = 43 weeks → buffer/oppWeeks ≫ 1 → clamped to 1.
    expect(availabilityFit(baseStudent(), baseOpp())).toBe(1);
  });

  it('scales linearly when the buffer is smaller than the placement length', () => {
    // grad exactly halfway between end_date and end_date + opp_length:
    // opp 13 weeks, end Aug 31 → halfway buffer = 6.5 weeks → grad ≈ Oct 16 2026
    const student = baseStudent({ expected_grad_date: new Date('2026-10-16') });
    expect(availabilityFit(student, baseOpp())).toBeCloseTo(0.5, 1);
  });
});

// ─── freshness ──────────────────────────────────────────────────────────────

describe('freshness', () => {
  it('returns 1 on the day of publication', () => {
    const opp = baseOpp({ published_at: NOW });
    expect(freshness(opp, NOW)).toBe(1);
  });

  it(`returns 0 at ${FRESHNESS_HORIZON_DAYS} days post-publish`, () => {
    const opp = baseOpp({
      published_at: new Date(NOW.getTime() - FRESHNESS_HORIZON_DAYS * 24 * 60 * 60 * 1000),
    });
    expect(freshness(opp, NOW)).toBe(0);
  });

  it('returns 0 beyond the horizon (no negative scores)', () => {
    const opp = baseOpp({
      published_at: new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000),
    });
    expect(freshness(opp, NOW)).toBe(0);
  });

  it('returns 0 for unpublished opportunities', () => {
    expect(freshness({ published_at: null }, NOW)).toBe(0);
  });

  it('decays linearly between publish and horizon', () => {
    // 15 days → 0.5
    const opp = baseOpp({
      published_at: new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000),
    });
    expect(freshness(opp, NOW)).toBeCloseTo(0.5, 5);
  });
});

// ─── scoreOpportunity ───────────────────────────────────────────────────────

describe('scoreOpportunity', () => {
  it('produces a score in [0, 1]', () => {
    const { score } = scoreOpportunity(baseStudent(), baseOpp(), NOW);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns the documented weighted sum', () => {
    // Baseline scenario:
    //   competency_overlap = 0.7
    //   programme_match    = 1
    //   availability_fit   = 1
    //   freshness          = 1 - 7/30 ≈ 0.7667
    // composite = 0.4×0.7 + 0.25×1 + 0.20×1 + 0.15×0.7667 ≈ 0.845
    const { score, factors } = scoreOpportunity(baseStudent(), baseOpp(), NOW);
    expect(factors.competency_overlap).toBeCloseTo(0.7, 5);
    expect(factors.programme_match).toBe(1);
    expect(factors.availability_fit).toBe(1);
    expect(factors.freshness).toBeCloseTo(1 - 7 / 30, 5);
    expect(score).toBeCloseTo(0.4 * 0.7 + 0.25 + 0.2 + 0.15 * (1 - 7 / 30), 5);
  });

  it('is deterministic — identical inputs yield identical outputs', () => {
    const a = scoreOpportunity(baseStudent(), baseOpp(), NOW);
    const b = scoreOpportunity(baseStudent(), baseOpp(), NOW);
    expect(a).toEqual(b);
  });

  it('drops to programme_match=0 contribution only when the student is ineligible', () => {
    const ineligible = baseStudent({ programme_code: 'OUTSIDE' });
    const { score, factors } = scoreOpportunity(ineligible, baseOpp(), NOW);
    expect(factors.programme_match).toBe(0);
    // The other factors are unaffected; only the 0.25 × 1 contribution disappears.
    const expected = 0.4 * 0.7 + 0 + 0.2 + 0.15 * (1 - 7 / 30);
    expect(score).toBeCloseTo(expected, 5);
  });
});

// ─── rankOpportunities ──────────────────────────────────────────────────────

describe('rankOpportunities', () => {
  it('returns descending by score', () => {
    const fresh = baseOpp({ opportunity_id: 'fresh', published_at: NOW });
    const old = baseOpp({
      opportunity_id: 'old',
      published_at: new Date(NOW.getTime() - 25 * 24 * 60 * 60 * 1000),
    });
    const ranked = rankOpportunities(baseStudent(), [old, fresh], NOW);
    expect(ranked[0]?.opportunity_id).toBe('fresh');
    expect(ranked[1]?.opportunity_id).toBe('old');
  });

  it('respects topN', () => {
    const opps = Array.from({ length: 5 }, (_, i) =>
      baseOpp({ opportunity_id: `o${i}` }),
    );
    const ranked = rankOpportunities(baseStudent(), opps, NOW, 3);
    expect(ranked.length).toBe(3);
  });

  it('puts ineligible-programme opportunities below eligible ones with the same other factors', () => {
    const eligible = baseOpp({ opportunity_id: 'elig', eligible_programmes: ['ICT-DIP'] });
    const ineligible = baseOpp({ opportunity_id: 'inel', eligible_programmes: ['CS-BSC'] });
    const ranked = rankOpportunities(baseStudent(), [ineligible, eligible], NOW);
    expect(ranked[0]?.opportunity_id).toBe('elig');
  });
});
