// PRC-08 — Evaluation aggregation. Pure functions; no DB, no Express.
//
// One evaluation's average score:
//   average = mean(attendance, professionalism, mean(competency_ratings))
// when at least one competency rating is present, else
//   average = mean(attendance, professionalism)
//
// Placement composite (for the certificate and reporting):
//   composite = mean(evaluation.average_score for all submitted evaluations)
// In the common case there is only a FINAL evaluation; if a MIDTERM exists
// it is included so the composite reflects both checkpoints. All ratings are
// integers in [1,5]; outputs round to 3 decimal places.

export interface EvaluationInput {
  evaluation_type: 'MIDTERM' | 'FINAL';
  attendance_rating: number;
  professionalism_rating: number;
  competency_ratings: number[];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function evaluationAverage(input: EvaluationInput): number {
  for (const r of [input.attendance_rating, input.professionalism_rating, ...input.competency_ratings]) {
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      throw new Error(`Rating ${r} is out of range [1,5]`);
    }
  }
  const compMean =
    input.competency_ratings.length > 0
      ? input.competency_ratings.reduce((a, b) => a + b, 0) / input.competency_ratings.length
      : null;
  const parts =
    compMean === null
      ? [input.attendance_rating, input.professionalism_rating]
      : [input.attendance_rating, input.professionalism_rating, compMean];
  return round3(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export function placementComposite(averages: number[]): number {
  if (averages.length === 0) {
    throw new Error('At least one evaluation is required for a composite');
  }
  return round3(averages.reduce((a, b) => a + b, 0) / averages.length);
}
