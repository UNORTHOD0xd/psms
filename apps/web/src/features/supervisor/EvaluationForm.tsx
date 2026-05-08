// INP-06 + PRC-08 — supervisor submits a midterm or final evaluation.
//
// Inputs:
//   • attendance_rating, professionalism_rating  — integer 1..5
//   • per-competency ratings — one row per competency_code on the
//     placement's opportunity, integer 1..5
//   • narrative — min 20 chars (matches the API's Zod schema; the
//     OpenAPI minLength of 50 is stale)
//   • recommend_future — boolean
//
// On a FINAL evaluation with a satisfactory composite, the API
// asynchronously generates the certificate (PRC-06). The UI just
// reports the submission as accepted and points the supervisor back
// to the inbox.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { z } from 'zod';

import {
  Button,
  ErrorBanner,
  Field,
  FieldShell,
  LoadingState,
  TextAreaField,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type {
  EvaluationType,
  Opportunity,
  Placement,
} from '../../lib/api/types.js';

const Rating = z.coerce.number().int().min(1).max(5);

const FormSchema = z.object({
  attendance_rating: Rating,
  professionalism_rating: Rating,
  competency_ratings: z
    .array(z.object({ competency_code: z.string(), rating: Rating }))
    .min(1, 'This opportunity has no listed competencies; the coordinator must add them before you can evaluate.'),
  narrative: z
    .string()
    .min(20, 'Please describe the student in at least 20 characters.')
    .max(4000),
  recommend_future: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
});

type FormValues = z.input<typeof FormSchema>;
type SubmitPayload = z.output<typeof FormSchema> & {
  placement_id: string;
  evaluation_type: EvaluationType;
};

interface Props {
  placementId: string;
  evaluationType: EvaluationType;
}

export function EvaluationForm({ placementId, evaluationType }: Props): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const placement = useQuery<Placement>({
    queryKey: ['placement', placementId],
    queryFn: () => api.get(`/placements/${placementId}`),
  });

  const opportunity = useQuery<Opportunity>({
    queryKey: ['opportunity', placement.data?.opportunity_id],
    queryFn: () => api.get(`/opportunities/${placement.data!.opportunity_id}`),
    enabled: Boolean(placement.data?.opportunity_id),
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      attendance_rating: 3 as unknown as FormValues['attendance_rating'],
      professionalism_rating: 3 as unknown as FormValues['professionalism_rating'],
      competency_ratings: [],
      narrative: '',
      recommend_future: 'true',
    },
  });

  const { fields } = useFieldArray({
    control,
    name: 'competency_ratings',
  });

  // Once the opportunity loads, seed the competency ratings array so
  // each row binds to a competency_code coming from the spec.
  useEffect(() => {
    const codes = opportunity.data?.required_competencies ?? [];
    if (codes.length === 0) return;
    reset((prev) => ({
      ...prev,
      competency_ratings: codes.map((code) => ({ competency_code: code, rating: 3 as unknown as FormValues['competency_ratings'][number]['rating'] })),
    }));
  }, [opportunity.data?.required_competencies, reset]);

  const submit = useMutation({
    mutationFn: (payload: SubmitPayload) => api.post('/evaluations', payload),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['supervisor', 'placement', placementId, 'evaluations'],
      });
      void navigate({ to: '/supervisor', replace: true });
    },
  });

  if (placement.isPending || opportunity.isPending) return <LoadingState />;
  if (placement.error) return <ErrorBanner error={placement.error} />;
  if (opportunity.error) return <ErrorBanner error={opportunity.error} />;
  if (!placement.data || !opportunity.data) {
    return <ErrorBanner error={new Error('Placement or opportunity not found.')} />;
  }

  return (
    <section className="psms-detail">
      <h1>
        {evaluationType === 'MIDTERM' ? 'Midterm' : 'Final'} evaluation —{' '}
        {placement.data.student_name ?? 'student'}
      </h1>
      <p>{placement.data.opportunity_title}</p>

      <form
        onSubmit={handleSubmit((values) => {
          const parsed = FormSchema.parse(values);
          submit.mutate({
            ...parsed,
            placement_id: placementId,
            evaluation_type: evaluationType,
          });
        })}
        noValidate
        className="psms-form"
      >
        <ErrorBanner error={submit.error} />

        <Field
          label="Attendance (1 poor · 5 excellent)"
          type="number"
          min={1}
          max={5}
          step={1}
          error={errors.attendance_rating?.message}
          {...register('attendance_rating')}
        />
        <Field
          label="Professionalism (1 poor · 5 excellent)"
          type="number"
          min={1}
          max={5}
          step={1}
          error={errors.professionalism_rating?.message}
          {...register('professionalism_rating')}
        />

        <fieldset className="psms-fieldset">
          <legend>Competencies</legend>
          {fields.length === 0 ? (
            <p>This opportunity does not list required competencies.</p>
          ) : null}
          {fields.map((field, idx) => (
            <Field
              key={field.id}
              label={field.competency_code}
              type="number"
              min={1}
              max={5}
              step={1}
              error={errors.competency_ratings?.[idx]?.rating?.message}
              {...register(`competency_ratings.${idx}.rating` as const)}
            />
          ))}
          {errors.competency_ratings?.message ? (
            <p role="alert" className="psms-field__error">
              {errors.competency_ratings.message}
            </p>
          ) : null}
        </fieldset>

        <TextAreaField
          label="Narrative"
          rows={6}
          hint="Describe how the student performed against the placement's expectations. Used verbatim in the final report."
          error={errors.narrative?.message}
          {...register('narrative')}
        />

        <FieldShell label="Would you take this student again?">
          <Controller
            control={control}
            name="recommend_future"
            render={({ field }) => (
              <select {...field}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            )}
          />
        </FieldShell>

        <Button type="submit" loading={isSubmitting || submit.isPending}>
          Submit evaluation
        </Button>
      </form>
    </section>
  );
}
