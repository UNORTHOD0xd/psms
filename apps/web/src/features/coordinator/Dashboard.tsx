// PRC-09 / OUT-02 — Coordinator dashboard.
//
// Mirrors the shape returned by GET /reports/coordinator-dashboard. We
// don't graph anything in the pilot (PRF-07 budget: ≤ 2 s) — just
// surface the six counts the coordinator needs at a glance.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';

interface CoordinatorDashboard {
  active_placements: number;
  pending_hours_logs: number;
  pending_hours_total: number;
  applications_pending: number;
  evaluations_due_soon: number;
  students_at_risk: number;
  opportunities_by_status: Record<'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED', number>;
  generated_at: string;
}

export function CoordinatorDashboard(): JSX.Element {
  const dash = useQuery<CoordinatorDashboard>({
    queryKey: ['coordinator', 'dashboard'],
    queryFn: () => api.get('/reports/coordinator-dashboard'),
  });

  return (
    <section>
      <h1>Dashboard</h1>
      {dash.isPending ? <LoadingState /> : null}
      <ErrorBanner error={dash.error} />
      {dash.data ? (
        <>
          <div className="psms-grid">
            <article className="psms-card">
              <h2>Active placements</h2>
              <p style={{ fontSize: '2rem', margin: 0 }}>{dash.data.active_placements}</p>
              <p className="psms-list__meta">
                <Link to="/coordinator/placements">Open monitor →</Link>
              </p>
            </article>

            <article className="psms-card">
              <h2>Pending hours</h2>
              <dl>
                <dt>Logs awaiting decision</dt>
                <dd>{dash.data.pending_hours_logs}</dd>
                <dt>Total hours</dt>
                <dd>{dash.data.pending_hours_total}</dd>
              </dl>
            </article>

            <article className="psms-card">
              <h2>Applications</h2>
              <p style={{ fontSize: '2rem', margin: 0 }}>{dash.data.applications_pending}</p>
              <p className="psms-list__meta">
                Pending review ·{' '}
                <Link to="/coordinator/applications">Review →</Link>
              </p>
            </article>

            <article className="psms-card">
              <h2>Final evaluations due</h2>
              <p style={{ fontSize: '2rem', margin: 0 }}>{dash.data.evaluations_due_soon}</p>
              <p className="psms-list__meta">In the next 14 days.</p>
            </article>

            <article className="psms-card">
              <h2>Students at risk</h2>
              <p style={{ fontSize: '2rem', margin: 0 }}>{dash.data.students_at_risk}</p>
              <p className="psms-list__meta">
                Approved hours below 50% with placement closing soon ·{' '}
                <Link to="/coordinator/reports">Open shortfall →</Link>
              </p>
            </article>

            <article className="psms-card">
              <h2>Opportunities</h2>
              <dl>
                <dt>Draft</dt>
                <dd>{dash.data.opportunities_by_status.DRAFT}</dd>
                <dt>Published</dt>
                <dd>{dash.data.opportunities_by_status.PUBLISHED}</dd>
                <dt>Closed</dt>
                <dd>{dash.data.opportunities_by_status.CLOSED}</dd>
                <dt>Archived</dt>
                <dd>{dash.data.opportunities_by_status.ARCHIVED}</dd>
              </dl>
              <p className="psms-list__meta">
                <Link to="/coordinator/opportunities">Open list →</Link>
              </p>
            </article>
          </div>
          <p className="psms-list__meta">
            Generated at {new Date(dash.data.generated_at).toLocaleString()}.
          </p>
        </>
      ) : null}
    </section>
  );
}
