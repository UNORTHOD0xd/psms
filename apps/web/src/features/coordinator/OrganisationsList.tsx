// INP-02 — Coordinator-facing host organisation registry.

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
import type { Organisation, Page } from '../../lib/api/types.js';

type StatusFilter = '' | 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export function OrganisationsList(): JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('');
  const [q, setQ] = useState('');

  const query = useQuery<Page<Organisation>>({
    queryKey: ['coordinator', 'organisations', { page, status, q }],
    queryFn: () =>
      api.get('/organisations', {
        query: {
          page,
          pageSize: 25,
          ...(status ? { status } : {}),
          ...(q ? { q } : {}),
        },
      }),
  });

  return (
    <section>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>Organisations</h1>
        <Link to="/coordinator/organisations/new" className="psms-btn psms-btn--primary">
          Register organisation
        </Link>
      </header>

      <form
        className="psms-form psms-form--inline psms-form__row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <label className="psms-field__label-text" htmlFor="org-q">
          Search
        </label>
        <input
          id="org-q"
          type="search"
          value={q}
          placeholder="Name contains…"
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="psms-field__label-text" htmlFor="org-status">
          Status
        </label>
        <select
          id="org-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </form>

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState
          title="No organisations match"
          detail="Try a different filter, or register a new organisation."
        />
      ) : null}

      <table className="psms-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Industry</th>
            <th>MOU</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {query.data?.data.map((o) => (
            <tr key={o.organisation_id}>
              <td>
                <Link
                  to="/coordinator/organisations/$id"
                  params={{ id: o.organisation_id }}
                >
                  {o.name}
                </Link>
              </td>
              <td>{o.type}</td>
              <td>{o.industry_sector}</td>
              <td>
                {o.mou_on_file ? (o.mou_expiry_date ?? 'On file') : 'No'}
              </td>
              <td>
                <span className={`psms-status psms-status--${o.status?.toLowerCase()}`}>
                  {o.status}
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
