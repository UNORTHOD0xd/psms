import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { EmptyState, ErrorBanner, LoadingState, Pagination } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Opportunity, Page } from '../../lib/api/types.js';

export function OpportunitiesList(): JSX.Element {
  const [page, setPage] = useState(1);
  const query = useQuery<Page<Opportunity>>({
    queryKey: ['opportunities', { page }],
    queryFn: () =>
      api.get('/opportunities', { query: { page, pageSize: 25, status: 'PUBLISHED' } }),
  });

  return (
    <section>
      <h1>Opportunities</h1>
      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No opportunities published"
          detail="Check back soon — the placement coordinator publishes new opportunities throughout the term."
        />
      ) : null}
      <ul className="psms-list">
        {query.data?.data.map((o) => (
          <li key={o.opportunity_id} className="psms-list__row">
            <div>
              <Link to="/student/opportunities/$id" params={{ id: o.opportunity_id }}>
                <strong>{o.title}</strong>
              </Link>
              <p className="psms-list__meta">
                {o.organisation_name ?? 'Organisation'} · Closes {o.application_deadline}
              </p>
            </div>
            <span className="psms-list__hours">{o.min_hours} h min</span>
          </li>
        ))}
      </ul>
      {query.data ? (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onChange={setPage}
        />
      ) : null}
    </section>
  );
}
