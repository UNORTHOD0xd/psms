// INP-03 — Coordinator-side opportunity detail. Surfaces the state
// machine: DRAFT can be edited or published, PUBLISHED can be closed.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

import {
  Button,
  ErrorBanner,
  LoadingState,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Opportunity } from '../../lib/api/types.js';

export function CoordinatorOpportunityDetail({ id }: { id: string }): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const opp = useQuery<Opportunity>({
    queryKey: ['coordinator', 'opportunity', id],
    queryFn: () => api.get(`/opportunities/${id}`),
  });

  const publish = useMutation<Opportunity>({
    mutationFn: () => api.post(`/opportunities/${id}/publish`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coordinator', 'opportunities'] });
      void qc.invalidateQueries({ queryKey: ['coordinator', 'opportunity', id] });
    },
  });

  const close = useMutation<Opportunity>({
    mutationFn: () => api.post(`/opportunities/${id}/close`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coordinator', 'opportunities'] });
      void qc.invalidateQueries({ queryKey: ['coordinator', 'opportunity', id] });
    },
  });

  if (opp.isPending) return <LoadingState />;
  if (opp.error) return <ErrorBanner error={opp.error} />;
  if (!opp.data) return <ErrorBanner error={new Error('Opportunity not found')} />;

  const o = opp.data;

  return (
    <section>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>{o.title}</h1>
        <span className={`psms-status psms-status--${o.status.toLowerCase()}`}>
          {o.status}
        </span>
      </header>

      <ErrorBanner error={publish.error || close.error} />

      <dl className="psms-detail__facts">
        <dt>Organisation</dt>
        <dd>{o.organisation_name}</dd>
        <dt>Window</dt>
        <dd>
          {o.start_date} → {o.end_date}
        </dd>
        <dt>Application deadline</dt>
        <dd>{o.application_deadline}</dd>
        <dt>Min hours</dt>
        <dd>{o.min_hours}</dd>
        <dt>Openings</dt>
        <dd>{o.openings}</dd>
        <dt>Required competencies</dt>
        <dd>{(o.required_competencies ?? []).join(', ') || '—'}</dd>
        <dt>Eligible programmes</dt>
        <dd>{(o.eligible_programmes ?? []).join(', ') || 'All'}</dd>
        <dt>Supervisor</dt>
        <dd>
          {o.supervisor_name} &lt;{o.supervisor_email}&gt;
        </dd>
        <dt>Stipend (JMD)</dt>
        <dd>{o.stipend_jmd ?? '—'}</dd>
      </dl>

      <h2>Description</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{o.description}</p>

      <div className="psms-form__row">
        {o.status === 'DRAFT' ? (
          <>
            <Link
              to="/coordinator/opportunities/$id/edit"
              params={{ id }}
              className="psms-btn psms-btn--secondary"
            >
              Edit draft
            </Link>
            <Button
              variant="primary"
              loading={publish.isPending}
              onClick={() => publish.mutate()}
            >
              Publish
            </Button>
          </>
        ) : null}
        {o.status === 'PUBLISHED' ? (
          <>
            <Link
              to="/coordinator/applications"
              search={{ opportunity_id: id }}
              className="psms-btn psms-btn--secondary"
            >
              Review applications
            </Link>
            <Button
              variant="danger"
              loading={close.isPending}
              onClick={() => {
                if (confirm('Close this opportunity? Applications can no longer be submitted.')) {
                  close.mutate();
                }
              }}
            >
              Close
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate({ to: '/coordinator/opportunities' })}
        >
          Back to list
        </Button>
      </div>
    </section>
  );
}
