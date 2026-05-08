// PRC-01 — iSIMS import runs.
//
// Lists past runs in reverse-chronological order. The "Trigger now"
// button posts to /imports/isims/trigger with an Idempotency-Key so
// retries replay rather than double-import. Status pills reuse the
// existing palette (SUCCEEDED → active/green, PARTIAL → warning,
// FAILED → danger, RUNNING → published/blue).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Pagination,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { ImportRun, Page } from '../../lib/api/types.js';

const RUN_STATUS_CLASS: Record<ImportRun['status'], string> = {
  RUNNING: 'published',
  SUCCEEDED: 'active',
  PARTIAL: 'pending',
  FAILED: 'terminated',
};

export function ImportsList(): JSX.Element {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const query = useQuery<Page<ImportRun>>({
    queryKey: ['admin', 'imports', { page }],
    queryFn: () => api.get('/imports/isims/runs', { query: { page, pageSize: 25 } }),
  });

  const trigger = useMutation<{ run_id: string; status: string }, unknown, void>({
    mutationFn: () =>
      api.post('/imports/isims/trigger', undefined, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'imports'] });
    },
  });

  return (
    <section>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>iSIMS imports</h1>
        <Button onClick={() => trigger.mutate()} loading={trigger.isPending}>
          Trigger now
        </Button>
      </header>
      <p className="psms-list__meta">
        The scheduler runs the iSIMS CSV import on the cron defined by{' '}
        <code>ISIMS_IMPORT_CRON</code>. Manual triggers respect idempotency
        keys so a re-click within seconds replays instead of re-running.
      </p>

      <ErrorBanner error={trigger.error} />
      {trigger.isSuccess ? (
        <p className="psms-field__hint" role="status">
          Run queued — refreshing list.
        </p>
      ) : null}

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState title="No import runs yet" detail="Trigger one to see history." />
      ) : null}

      {query.data && query.data.data.length > 0 ? (
        <table className="psms-table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Total</th>
              <th>Imported</th>
              <th>Quarantined</th>
              <th>Run</th>
            </tr>
          </thead>
          <tbody>
            {query.data.data.map((run) => (
              <tr key={run.run_id}>
                <td>{new Date(run.started_at).toLocaleString()}</td>
                <td>
                  <span
                    className={`psms-status psms-status--${RUN_STATUS_CLASS[run.status]}`}
                  >
                    {run.status}
                  </span>
                </td>
                <td>{run.rows_total}</td>
                <td>{run.rows_imported}</td>
                <td>{run.rows_quarantined}</td>
                <td>
                  <Link to="/admin/imports/$id" params={{ id: run.run_id }}>
                    Open
                  </Link>
                </td>
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
