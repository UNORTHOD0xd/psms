import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  TextAreaField,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { HoursLogEntry, Page, Placement } from '../../lib/api/types.js';

// INP-05 hours-log capture. Bounded 1..16 hours / day to match the API.
const HoursSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO date (YYYY-MM-DD)'),
  week_number: z.coerce.number().int().min(1).max(52),
  hours: z.coerce.number().min(1).max(16),
  activity_narrative: z
    .string()
    .min(20, 'Describe the activity in at least 20 characters.')
    .max(2000),
});

type HoursValues = z.infer<typeof HoursSchema>;

export function PlacementDetail({ id }: { id: string }): JSX.Element {
  const qc = useQueryClient();
  const placement = useQuery<Placement>({
    queryKey: ['placement', id],
    queryFn: () => api.get(`/placements/${id}`),
  });
  const hours = useQuery<Page<HoursLogEntry>>({
    queryKey: ['placement', id, 'hours'],
    queryFn: () => api.get(`/placements/${id}/hours`, { query: { pageSize: 50 } }),
  });

  const [submitError, setSubmitError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HoursValues>({ resolver: zodResolver(HoursSchema) });

  const submit = useMutation({
    mutationFn: (values: HoursValues) => api.post(`/placements/${id}/hours`, values),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ['placement', id, 'hours'] });
    },
    onError: (err) => setSubmitError(err),
  });

  if (placement.isPending) return <LoadingState />;
  if (placement.error) return <ErrorBanner error={placement.error} />;
  if (!placement.data) return <p>Not found.</p>;

  const p = placement.data;
  return (
    <section className="psms-detail">
      <h1>{p.opportunity_title ?? 'Placement'}</h1>
      <dl className="psms-detail__facts">
        <dt>Status</dt>
        <dd>{p.status}</dd>
        <dt>Start</dt>
        <dd>{p.start_date}</dd>
        <dt>End</dt>
        <dd>{p.end_date}</dd>
        {p.composite_rating !== null && p.composite_rating !== undefined ? (
          <>
            <dt>Composite rating</dt>
            <dd>{p.composite_rating.toFixed(2)}</dd>
          </>
        ) : null}
      </dl>

      <h2>Log this week's hours</h2>
      <form
        onSubmit={handleSubmit((v) => submit.mutateAsync(v))}
        className="psms-form"
        noValidate
      >
        <ErrorBanner error={submitError} />
        <Field
          label="Activity date"
          type="date"
          error={errors.date?.message}
          {...register('date')}
        />
        <Field
          label="Week number"
          type="number"
          step="1"
          min={1}
          max={52}
          error={errors.week_number?.message}
          {...register('week_number')}
        />
        <Field
          label="Hours"
          type="number"
          step="0.5"
          min={1}
          max={16}
          error={errors.hours?.message}
          {...register('hours')}
        />
        <TextAreaField
          label="What did you do?"
          rows={4}
          hint="Plain language is fine — your supervisor will read this when they approve the entry."
          error={errors.activity_narrative?.message}
          {...register('activity_narrative')}
        />
        <Button type="submit" loading={isSubmitting || submit.isPending}>
          Submit for approval
        </Button>
      </form>

      <h2>Recent entries</h2>
      {hours.isPending ? <LoadingState /> : null}
      <ErrorBanner error={hours.error} />
      {hours.data && hours.data.data.length === 0 ? (
        <EmptyState
          title="No hours logged yet"
          detail="Use the form above to record your first entry."
        />
      ) : null}
      <table className="psms-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Hours</th>
            <th scope="col">Status</th>
            <th scope="col">Approved on</th>
          </tr>
        </thead>
        <tbody>
          {hours.data?.data.map((h) => (
            <tr key={h.log_id}>
              <td>{h.date}</td>
              <td>{h.hours}</td>
              <td>
                <span className={`psms-status psms-status--${h.status.toLowerCase()}`}>
                  {h.status}
                </span>
              </td>
              <td>{h.approved_at?.slice(0, 10) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
