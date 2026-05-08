import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { EmptyState, ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Application, Page } from '../../lib/api/types.js';

export function ApplicationsList(): JSX.Element {
  const query = useQuery<Page<Application>>({
    queryKey: ['student', 'applications'],
    queryFn: () => api.get('/me/applications', { query: { pageSize: 50 } }),
  });

  return (
    <section>
      <h1>My applications</h1>
      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No applications yet"
          detail="Apply to a published opportunity from the Opportunities tab."
          action={<Link to="/student/opportunities">Browse opportunities</Link>}
        />
      ) : null}
      <table className="psms-table">
        <thead>
          <tr>
            <th scope="col">Opportunity</th>
            <th scope="col">Submitted</th>
            <th scope="col">Status</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {query.data?.data.map((a) => (
            <tr key={a.application_id}>
              <td>{a.opportunity_title ?? '—'}</td>
              <td>{a.submitted_at?.slice(0, 10) ?? '—'}</td>
              <td>
                <span className={`psms-status psms-status--${a.status.toLowerCase()}`}>
                  {a.status}
                </span>
              </td>
              <td>
                {a.score === null || a.score === undefined ? '—' : a.score.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
