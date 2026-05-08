import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { EmptyState, ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { LedgerSummary, Page, Placement, Recommendation } from '../../lib/api/types.js';

export function StudentDashboard(): JSX.Element {
  const placements = useQuery<Page<Placement>>({
    queryKey: ['student', 'placements'],
    queryFn: () => api.get('/me/placements', { query: { pageSize: 5 } }),
  });
  const recs = useQuery<Recommendation[]>({
    queryKey: ['student', 'recommendations'],
    queryFn: () => api.get('/me/recommendations'),
  });
  const ledger = useQuery<LedgerSummary>({
    queryKey: ['student', 'ledger', 'summary'],
    queryFn: () => api.get('/me/ledger'),
  });

  return (
    <section>
      <h1>Dashboard</h1>
      <div className="psms-grid">
        <article className="psms-card">
          <h2>Service hours</h2>
          {ledger.isPending ? <LoadingState /> : null}
          <ErrorBanner error={ledger.error} />
          {ledger.data ? (
            <dl>
              <dt>Verified</dt>
              <dd>{ledger.data.hours_verified}</dd>
              <dt>Pending</dt>
              <dd>{ledger.data.hours_pending}</dd>
              <dt>Required</dt>
              <dd>{ledger.data.hours_required}</dd>
            </dl>
          ) : null}
        </article>

        <article className="psms-card">
          <h2>Active placements</h2>
          {placements.isPending ? <LoadingState /> : null}
          <ErrorBanner error={placements.error} />
          {placements.data && placements.data.data.length === 0 ? (
            <EmptyState
              title="No placement yet"
              detail="Apply to a published opportunity to get started."
              action={<Link to="/student/opportunities">Browse opportunities</Link>}
            />
          ) : null}
          <ul>
            {placements.data?.data.map((p) => (
              <li key={p.placement_id}>
                <Link to="/student/placements/$id" params={{ id: p.placement_id }}>
                  {p.opportunity_title ?? 'Placement'}
                </Link>
                <span className="psms-status">{p.status}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="psms-card">
          <h2>Recommended for you</h2>
          {recs.isPending ? <LoadingState /> : null}
          <ErrorBanner error={recs.error} />
          {recs.data && recs.data.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              detail="Once your programme is on file, the matching engine will surface opportunities here."
            />
          ) : null}
          <ul>
            {recs.data?.slice(0, 3).map((r) => (
              <li key={r.opportunity.opportunity_id}>
                <Link
                  to="/student/opportunities/$id"
                  params={{ id: r.opportunity.opportunity_id }}
                >
                  {r.opportunity.title}
                </Link>
                <span className="psms-score">Score: {r.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
