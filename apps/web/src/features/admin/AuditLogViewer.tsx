// OUT-09 — Admin audit-log explorer.
//
// The /reports/audit-log endpoint returns JSON for table rendering, or
// CSV when Accept: text/csv. Filters: from/to (datetime), actor_user_id,
// action substring. Pagination is server-side. Export hits the same
// endpoint with an Accept override.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  Pagination,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { AuditLogEntry, Page } from '../../lib/api/types.js';

interface Filters {
  from: string;
  to: string;
  actor_user_id: string;
  action: string;
}

export function AuditLogViewer(): JSX.Element {
  const [page, setPage] = useState(1);
  const [committed, setCommitted] = useState<Filters>({
    from: '',
    to: '',
    actor_user_id: '',
    action: '',
  });
  const [draft, setDraft] = useState<Filters>(committed);
  const [exportError, setExportError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);

  const query = useQuery<Page<AuditLogEntry>>({
    queryKey: ['admin', 'audit-log', { page, ...committed }],
    queryFn: () =>
      api.get('/reports/audit-log', {
        query: {
          page,
          pageSize: 25,
          ...(committed.from ? { from: toIso(committed.from) } : {}),
          ...(committed.to ? { to: toIso(committed.to) } : {}),
          ...(committed.actor_user_id ? { actor_user_id: committed.actor_user_id } : {}),
          ...(committed.action ? { action: committed.action } : {}),
        },
      }),
  });

  return (
    <section>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>Audit log</h1>
        <Button
          variant="secondary"
          loading={exporting}
          onClick={() => {
            setExportError(null);
            setExporting(true);
            exportCsv(committed)
              .catch((err: unknown) => setExportError(err))
              .finally(() => setExporting(false));
          }}
        >
          Export CSV
        </Button>
      </header>

      <ErrorBanner error={exportError} />

      <form
        className="psms-form psms-form--inline"
        onSubmit={(e) => {
          e.preventDefault();
          setCommitted(draft);
          setPage(1);
        }}
      >
        <div className="psms-form__row">
          <Field
            label="From"
            type="datetime-local"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
          <Field
            label="To"
            type="datetime-local"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
          <Field
            label="Actor user ID"
            type="text"
            value={draft.actor_user_id}
            placeholder="UUID"
            onChange={(e) => setDraft((d) => ({ ...d, actor_user_id: e.target.value.trim() }))}
          />
          <Field
            label="Action contains"
            type="text"
            value={draft.action}
            placeholder="e.g. application.approve"
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
          />
        </div>
        <div className="psms-form__row">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const cleared = { from: '', to: '', actor_user_id: '', action: '' };
              setDraft(cleared);
              setCommitted(cleared);
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState title="No audit entries match" />
      ) : null}

      {query.data && query.data.data.length > 0 ? (
        <table className="psms-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {query.data.data.map((row) => (
              <tr key={row.audit_id}>
                <td>{new Date(row.ts).toLocaleString()}</td>
                <td>
                  <span className="psms-status">{row.actor_role}</span>{' '}
                  <code>{row.actor_user_id ? short(row.actor_user_id) : '—'}</code>
                </td>
                <td>{row.action}</td>
                <td>
                  {row.resource_type}
                  {row.resource_id ? (
                    <>
                      {' '}
                      <code>{short(row.resource_id)}</code>
                    </>
                  ) : null}
                </td>
                <td>{row.ip ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

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

function short(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function toIso(local: string): string {
  // datetime-local strings ('YYYY-MM-DDTHH:MM') are naive local time.
  // The API requires full ISO 8601 with offset; rely on the browser's
  // local TZ to resolve.
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

async function exportCsv(filters: Filters): Promise<void> {
  const url = new URL('/api/v1/reports/audit-log', window.location.origin);
  if (filters.from) url.searchParams.set('from', toIso(filters.from));
  if (filters.to) url.searchParams.set('to', toIso(filters.to));
  if (filters.actor_user_id) url.searchParams.set('actor_user_id', filters.actor_user_id);
  if (filters.action) url.searchParams.set('action', filters.action);
  const res = await fetch(url.toString(), {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
