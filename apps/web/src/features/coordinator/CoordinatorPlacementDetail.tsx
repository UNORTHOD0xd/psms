// Coordinator placement detail.
//
// Shows the placement metadata, the existing site-visit notes (INP-08),
// the manual status-override controls, and an inline form to record a
// new site visit with optional follow-up actions.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  FieldShell,
  LoadingState,
  TextAreaField,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type {
  Placement,
  PlacementStatus,
  SiteVisitNote,
} from '../../lib/api/types.js';

export function CoordinatorPlacementDetail({ id }: { id: string }): JSX.Element {
  const placement = useQuery<Placement>({
    queryKey: ['coordinator', 'placement', id],
    queryFn: () => api.get(`/placements/${id}`),
  });

  if (placement.isPending) return <LoadingState />;
  if (placement.error) return <ErrorBanner error={placement.error} />;
  if (!placement.data) return <ErrorBanner error={new Error('Placement not found')} />;
  const p = placement.data;

  return (
    <section>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>{p.opportunity_title}</h1>
        <span className={`psms-status psms-status--${p.status.toLowerCase()}`}>
          {p.status}
        </span>
      </header>

      <dl className="psms-detail__facts">
        <dt>Student</dt>
        <dd>{p.student_name}</dd>
        <dt>Supervisor</dt>
        <dd>
          {p.supervisor_name}
          {p.supervisor_email ? ` <${p.supervisor_email}>` : ''}
        </dd>
        <dt>Organisation</dt>
        <dd>{p.organisation_name}</dd>
        <dt>Window</dt>
        <dd>
          {p.start_date} → {p.end_date}
        </dd>
        {p.composite_rating != null ? (
          <>
            <dt>Composite rating</dt>
            <dd>{p.composite_rating.toFixed(2)}</dd>
          </>
        ) : null}
      </dl>

      <StatusOverride placement={p} />
      <SiteVisitsSection placementId={id} />
    </section>
  );
}

// ── Status override ────────────────────────────────────────────────────────

const ALLOWED_NEXT: Record<PlacementStatus, PlacementStatus[]> = {
  PENDING_START: ['ACTIVE', 'TERMINATED'],
  ACTIVE: ['COMPLETED', 'TERMINATED'],
  COMPLETED: [],
  TERMINATED: [],
};

function StatusOverride({ placement }: { placement: Placement }): JSX.Element {
  const qc = useQueryClient();
  const [target, setTarget] = useState<PlacementStatus | ''>('');
  const [reason, setReason] = useState('');

  const next = ALLOWED_NEXT[placement.status];

  const mutation = useMutation<
    Placement,
    unknown,
    { status: PlacementStatus; terminated_reason?: string }
  >({
    mutationFn: (body) => api.post(`/placements/${placement.placement_id}/status`, body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['coordinator', 'placement', placement.placement_id],
      });
      void qc.invalidateQueries({ queryKey: ['coordinator', 'placements'] });
      setTarget('');
      setReason('');
    },
  });

  if (next.length === 0) return <p className="psms-list__meta">Status is terminal.</p>;

  return (
    <fieldset className="psms-fieldset">
      <legend>Override status</legend>
      <ErrorBanner error={mutation.error} />
      <form
        className="psms-form psms-form--inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (!target) return;
          if (target === 'TERMINATED' && reason.trim().length < 5) return;
          mutation.mutate({
            status: target,
            ...(target === 'TERMINATED' ? { terminated_reason: reason.trim() } : {}),
          });
        }}
      >
        <FieldShell label="Move to">
          <select value={target} onChange={(e) => setTarget(e.target.value as PlacementStatus)}>
            <option value="">Choose…</option>
            {next.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FieldShell>
        {target === 'TERMINATED' ? (
          <TextAreaField
            label="Reason (required for termination)"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : null}
        <Button type="submit" loading={mutation.isPending} disabled={!target}>
          Apply
        </Button>
      </form>
    </fieldset>
  );
}

// ── Site visits ────────────────────────────────────────────────────────────

const SiteVisitFormSchema = z.object({
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  narrative: z.string().min(20, 'Write at least 20 characters').max(4000),
  overall_assessment: z.enum(['SATISFACTORY', 'CONCERNS', 'UNSATISFACTORY']),
  follow_up_actions: z.array(
    z.object({
      action: z.string().min(1).max(500),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    }),
  ),
});

type SiteVisitFormValues = z.infer<typeof SiteVisitFormSchema>;

function SiteVisitsSection({ placementId }: { placementId: string }): JSX.Element {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const visits = useQuery<SiteVisitNote[]>({
    queryKey: ['coordinator', 'placement', placementId, 'site-visits'],
    queryFn: () => api.get(`/placements/${placementId}/site-visits`),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SiteVisitFormValues>({
    resolver: zodResolver(SiteVisitFormSchema),
    defaultValues: {
      visit_date: '',
      narrative: '',
      overall_assessment: 'SATISFACTORY',
      follow_up_actions: [],
    },
  });
  const followUps = useFieldArray({ control, name: 'follow_up_actions' });

  const create = useMutation<SiteVisitNote, unknown, SiteVisitFormValues>({
    mutationFn: (body) => api.post(`/placements/${placementId}/site-visits`, body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['coordinator', 'placement', placementId, 'site-visits'],
      });
      reset();
      setShowForm(false);
    },
  });

  return (
    <section>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h2>Site visits</h2>
        {!showForm ? (
          <Button onClick={() => setShowForm(true)}>Record site visit</Button>
        ) : null}
      </header>

      {visits.isPending ? <LoadingState /> : null}
      <ErrorBanner error={visits.error} />
      {visits.data && visits.data.length === 0 ? (
        <EmptyState title="No site visits recorded yet" />
      ) : null}

      <ul className="psms-list">
        {visits.data?.map((v) => (
          <li key={v.note_id} className="psms-list__row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <strong>
                {v.visit_date} · {v.overall_assessment}
              </strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{v.narrative}</p>
              {v.follow_up_actions && v.follow_up_actions.length > 0 ? (
                <ul>
                  {v.follow_up_actions.map((f, i) => (
                    <li key={i}>
                      {f.action} — due {f.due_date}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {showForm ? (
        <form
          className="psms-form"
          noValidate
          onSubmit={handleSubmit((values) => create.mutate(values))}
        >
          <ErrorBanner error={create.error} />
          <Field
            label="Visit date"
            type="date"
            error={errors.visit_date?.message}
            {...register('visit_date')}
          />
          <TextAreaField
            label="Narrative"
            rows={5}
            error={errors.narrative?.message}
            {...register('narrative')}
          />
          <FieldShell
            label="Overall assessment"
            error={errors.overall_assessment?.message}
          >
            <select {...register('overall_assessment')}>
              <option value="SATISFACTORY">Satisfactory</option>
              <option value="CONCERNS">Concerns</option>
              <option value="UNSATISFACTORY">Unsatisfactory</option>
            </select>
          </FieldShell>

          <fieldset className="psms-fieldset">
            <legend>Follow-up actions</legend>
            {followUps.fields.length === 0 ? (
              <p className="psms-list__meta">No follow-ups.</p>
            ) : null}
            {followUps.fields.map((f, i) => (
              <div key={f.id} className="psms-form__row">
                <Field
                  label={`Action ${i + 1}`}
                  error={errors.follow_up_actions?.[i]?.action?.message}
                  {...register(`follow_up_actions.${i}.action` as const)}
                />
                <Field
                  label="Due"
                  type="date"
                  error={errors.follow_up_actions?.[i]?.due_date?.message}
                  {...register(`follow_up_actions.${i}.due_date` as const)}
                />
                <Button type="button" variant="ghost" onClick={() => followUps.remove(i)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => followUps.append({ action: '', due_date: '' })}
            >
              Add follow-up
            </Button>
          </fieldset>

          <div className="psms-form__row">
            <Button type="submit" loading={create.isPending}>
              Save site visit
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
