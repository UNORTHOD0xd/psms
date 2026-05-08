// Coordinator placement monitor. Lists placements (filtered by status)
// and links into a detail view that surfaces site visits (INP-08) and
// manual status overrides.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  Pagination,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Page, Placement, PlacementStatus } from '../../lib/api/types.js';

type StatusFilter = '' | PlacementStatus;

export function PlacementMonitor(): JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');

  const query = useQuery<Page<Placement>>({
    queryKey: ['coordinator', 'placements', { page, status }],
    queryFn: () =>
      api.get('/placements', {
        query: { page, pageSize: 25, ...(status ? { status } : {}) },
      }),
  });

  return (
    <section>
      <h1>Placements</h1>

      <form
        className="psms-form psms-form--inline psms-form__row"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="psms-field__label-text" htmlFor="pl-status">
          Status
        </label>
        <select
          id="pl-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="PENDING_START">Pending start</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="TERMINATED">Terminated</option>
        </select>
      </form>

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState title="No placements match this filter" />
      ) : null}

      <table className="psms-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Opportunity</th>
            <th>Organisation</th>
            <th>Window</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {query.data?.data.map((p) => (
            <tr key={p.placement_id}>
              <td>{p.student_name}</td>
              <td>
                <Link
                  to="/coordinator/placements/$id"
                  params={{ id: p.placement_id }}
                >
                  {p.opportunity_title}
                </Link>
              </td>
              <td>{p.organisation_name}</td>
              <td>
                {p.start_date} → {p.end_date}
              </td>
              <td>
                <span className={`psms-status psms-status--${p.status.toLowerCase()}`}>
                  {p.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
