import type {
  Evaluation,
  EvaluationCompetencyRating,
  Competency,
} from '@prisma/client';

type EvaluationWithRatings = Evaluation & {
  competency_ratings: (EvaluationCompetencyRating & {
    competency: Pick<Competency, 'competency_code' | 'name'>;
  })[];
};

export function mapEvaluation(e: EvaluationWithRatings) {
  return {
    evaluation_id: e.evaluation_id,
    placement_id: e.placement_id,
    evaluation_type: e.evaluation_type,
    attendance_rating: e.attendance_rating,
    professionalism_rating: e.professionalism_rating,
    narrative: e.narrative,
    recommend_future: e.recommend_future,
    submitted_by_user_id: e.submitted_by_user_id,
    submitted_at: e.submitted_at.toISOString(),
    average_score: Number(e.average_score),
    competency_ratings: e.competency_ratings.map((r) => ({
      competency_code: r.competency.competency_code,
      competency_name: r.competency.name,
      rating: r.rating,
    })),
  };
}

export const EVALUATION_INCLUDE = {
  competency_ratings: {
    include: { competency: { select: { competency_code: true, name: true } } },
  },
} as const;
