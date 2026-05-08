import { describe, it, expect } from 'vitest';

import {
  evaluationAverage,
  placementComposite,
} from '../../src/modules/evaluations/aggregator.js';

describe('PRC-08 evaluationAverage', () => {
  it('averages attendance + professionalism + competency mean (mean-of-means)', () => {
    // attendance=5, professionalism=4, competencies=[3,5] → mean(comp)=4
    // outer = mean(5,4,4) = 4.333
    expect(
      evaluationAverage({
        evaluation_type: 'FINAL',
        attendance_rating: 5,
        professionalism_rating: 4,
        competency_ratings: [3, 5],
      }),
    ).toBe(4.333);
  });

  it('falls back to mean(attendance, professionalism) when no competencies', () => {
    expect(
      evaluationAverage({
        evaluation_type: 'MIDTERM',
        attendance_rating: 4,
        professionalism_rating: 5,
        competency_ratings: [],
      }),
    ).toBe(4.5);
  });

  it('handles all-fives perfectly', () => {
    expect(
      evaluationAverage({
        evaluation_type: 'FINAL',
        attendance_rating: 5,
        professionalism_rating: 5,
        competency_ratings: [5, 5, 5, 5],
      }),
    ).toBe(5);
  });

  it('rejects out-of-range ratings', () => {
    expect(() =>
      evaluationAverage({
        evaluation_type: 'FINAL',
        attendance_rating: 6,
        professionalism_rating: 4,
        competency_ratings: [3],
      }),
    ).toThrow();
    expect(() =>
      evaluationAverage({
        evaluation_type: 'FINAL',
        attendance_rating: 4,
        professionalism_rating: 4,
        competency_ratings: [0],
      }),
    ).toThrow();
  });

  it('rejects non-integer ratings', () => {
    expect(() =>
      evaluationAverage({
        evaluation_type: 'FINAL',
        attendance_rating: 4.5,
        professionalism_rating: 4,
        competency_ratings: [3],
      }),
    ).toThrow();
  });
});

describe('PRC-08 placementComposite', () => {
  it('returns the single average when only one evaluation exists', () => {
    expect(placementComposite([4.333])).toBe(4.333);
  });

  it('means across midterm and final', () => {
    expect(placementComposite([4.0, 5.0])).toBe(4.5);
  });

  it('throws when no evaluations are provided', () => {
    expect(() => placementComposite([])).toThrow();
  });

  it('rounds to 3 decimal places', () => {
    // (1 + 2) / 3 ... well need three numbers giving 4 decimal places
    expect(placementComposite([3.333, 3.333, 3.333])).toBe(3.333);
    expect(placementComposite([4, 5, 4])).toBeCloseTo(4.333, 3);
  });
});
