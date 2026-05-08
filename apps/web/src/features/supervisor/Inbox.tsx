// Supervisor inbox.
//
// The supervisor session is scoped to a single placement (PRC-03). The
// inbox surfaces the two actions a supervisor needs to take from a
// magic-link email:
//
//   1. Approve or reject pending weekly hours (PRC-04 ledger feeds off
//      these decisions).
//   2. Submit a midterm or final evaluation (INP-06, PRC-08).
//
// We render hours-decisions inline because the action is one click, and
// link out to the evaluation form because that one is a long form.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { EmptyState, ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type {
  Evaluation,
  HoursLogEntry,
  Page,
  Placement,
} from '../../lib/api/types.js';

import { HoursDecisionForm } from './HoursDecisionForm.js';

export function SupervisorInbox(): JSX.Element {
  const placements = useQuery<Page<Placement>>({
    queryKey: ['supervisor', 'placements'],
    queryFn: () => api.get('/placements'),
  });

  if (placements.isPending) return <LoadingState />;
  if (placements.error) return <ErrorBanner error={placements.error} />;
  if (!placements.data || placements.data.data.length === 0) {
    return (
      <EmptyState
        title="No placement is currently scoped to your session"
        detail="If you reached this page from an email link, please ask the placement coordinator to issue a fresh link."
      />
    );
  }

  return (
    <section>
      <h1>Inbox</h1>
      {placements.data.data.map((p) => (
        <PlacementInboxCard key={p.placement_id} placement={p} />
      ))}
    </section>
  );
}

function PlacementInboxCard({ placement }: { placement: Placement }): JSX.Element {
  const id = placement.placement_id;

  const hours = useQuery<Page<HoursLogEntry>>({
    queryKey: ['supervisor', 'placement', id, 'hours', 'PENDING'],
    queryFn: () =>
      api.get(`/placements/${id}/hours`, {
        query: { status: 'PENDING', pageSize: 50 },
      }),
  });

  const evals = useQuery<Evaluation[]>({
    queryKey: ['supervisor', 'placement', id, 'evaluations'],
    queryFn: () => api.get('/evaluations', { query: { placement_id: id } }),
  });

  const hasMidterm = evals.data?.some((e) => e.evaluation_type === 'MIDTERM') ?? false;
  const hasFinal = evals.data?.some((e) => e.evaluation_type === 'FINAL') ?? false;

  return (
    <article className="psms-card">
      <header>
        <h2>{placement.opportunity_title ?? 'Placement'}</h2>
        <p className="psms-list__meta">
          {placement.student_name ?? 'Student'} ·{' '}
          {placement.start_date} → {placement.end_date} · {placement.status}
        </p>
      </header>

      <section>
        <h3>Pending hours</h3>
        {hours.isPending ? <LoadingState /> : null}
        <ErrorBanner error={hours.error} />
        {hours.data && hours.data.data.length === 0 ? (
          <EmptyState
            title="No hours awaiting your decision"
            detail="When the student logs their next week, it will appear here."
          />
        ) : null}
        <ul className="psms-list">
          {hours.data?.data.map((h) => (
            <li key={h.log_id} className="psms-list__row">
              <div>
                <strong>
                  Week {h.week_number} — {h.date} ({h.hours} h)
                </strong>
                {h.activity_narrative ? (
                  <p className="psms-list__meta">{h.activity_narrative}</p>
                ) : null}
              </div>
              <HoursDecisionForm placementId={id} log={h} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Evaluations</h3>
        {evals.isPending ? <LoadingState /> : null}
        <ErrorBanner error={evals.error} />
        <ul className="psms-list">
          {!hasMidterm ? (
            <li className="psms-list__row">
              <div>
                <strong>Midterm evaluation</strong>
                <p className="psms-list__meta">Due halfway through the placement.</p>
              </div>
              <Link
                to="/supervisor/placements/$id/evaluations/new"
                params={{ id }}
                search={{ type: 'MIDTERM' }}
                className="psms-btn psms-btn--primary"
              >
                Submit midterm
              </Link>
            </li>
          ) : null}
          {!hasFinal ? (
            <li className="psms-list__row">
              <div>
                <strong>Final evaluation</strong>
                <p className="psms-list__meta">
                  Due once the placement is ready to close. Triggers
                  certificate generation when satisfactory.
                </p>
              </div>
              <Link
                to="/supervisor/placements/$id/evaluations/new"
                params={{ id }}
                search={{ type: 'FINAL' }}
                className="psms-btn psms-btn--primary"
              >
                Submit final
              </Link>
            </li>
          ) : null}
          {hasMidterm && hasFinal ? (
            <EmptyState
              title="All evaluations submitted"
              detail="Thank you. The student's record is complete on your side."
            />
          ) : null}
        </ul>
      </section>
    </article>
  );
}
