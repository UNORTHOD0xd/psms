// INP-03 — Coordinator-facing opportunity list. Unlike the student list,
// this surfaces every status (DRAFT/PUBLISHED/CLOSED/ARCHIVED) and lets
// the coordinator drill into a draft to publish it, or a published
// posting to close it.

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
import type { Opportunity, OpportunityStatus, Page } from '../../lib/api/types.js';

type StatusFilter = '' | OpportunityStatus;

export function CoordinatorOpportunitiesList(): JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('');
  const [q, setQ] = useState('');

  const query = useQuery<Page<Opportunity>>({
    queryKey: ['coordinator', 'opportunities', { page, status, q }],
    queryFn: () =>
      api.get('/opportunities', {
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
        <h1>Opportunities</h1>
        <Link to="/coordinator/opportunities/new" className="psms-btn psms-btn--primary">
          New opportunity
        </Link>
      </header>

      <form
        className="psms-form psms-form--inline psms-form__row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <label className="psms-field__label-text" htmlFor="opp-q">
          Search
        </label>
        <input
          id="opp-q"
          type="search"
          value={q}
          placeholder="Title contains…"
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="psms-field__label-text" htmlFor="opp-status">
          Status
        </label>
        <select
          id="opp-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="CLOSED">Closed</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </form>

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState title="No opportunities match" />
      ) : null}

      <table className="psms-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Organisation</th>
            <th>Window</th>
            <th>Deadline</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {query.data?.data.map((o) => (
            <tr key={o.opportunity_id}>
              <td>
                <Link
                  to="/coordinator/opportunities/$id"
                  params={{ id: o.opportunity_id }}
                >
                  {o.title}
                </Link>
              </td>
              <td>{o.organisation_name}</td>
              <td>
                {o.start_date} → {o.end_date}
              </td>
              <td>{o.application_deadline}</td>
              <td>
                <span className={`psms-status psms-status--${o.status.toLowerCase()}`}>
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
