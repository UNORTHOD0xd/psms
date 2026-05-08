// PRC-01 — One iSIMS import run with its quarantine breakdown.
//
// The API returns the run row with `quarantine_rows` (max 100) and a
// `quarantine_reason_summary` aggregate. The schema isn't defined in
// the OpenAPI document precisely, so we narrow with a local interface.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import {
  EmptyState,
  ErrorBanner,
  LoadingState,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { ImportRun } from '../../lib/api/types.js';

interface QuarantineRow {
  quarantine_id: string;
  row_number: number;
  reason: string;
  raw_payload: unknown;
  created_at: string;
}

interface RunDetail extends ImportRun {
  source_filename: string | null;
  triggered_by_user_id: string | null;
  idempotency_key: string | null;
  quarantine_rows: QuarantineRow[];
}

const STATUS_CLASS: Record<ImportRun['status'], string> = {
  RUNNING: 'published',
  SUCCEEDED: 'active',
  PARTIAL: 'pending',
  FAILED: 'terminated',
};

interface Props {
  id: string;
}

export function ImportDetail({ id }: Props): JSX.Element {
  const query = useQuery<RunDetail>({
    queryKey: ['admin', 'import', id],
    queryFn: () => api.get(`/imports/isims/runs/${id}`),
  });

  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorBanner error={query.error} />;
  if (!query.data) return <EmptyState title="Run not found" />;

  const run = query.data;

  return (
    <section>
      <p>
        <Link to="/admin/imports">← Imports</Link>
      </p>
      <header className="psms-form__row" style={{ justifyContent: 'space-between' }}>
        <h1>Run {short(run.run_id)}</h1>
        <span className={`psms-status psms-status--${STATUS_CLASS[run.status]}`}>
          {run.status}
        </span>
      </header>

      <dl className="psms-detail__facts">
        <dt>Started</dt>
        <dd>{new Date(run.started_at).toLocaleString()}</dd>
        {run.completed_at ? (
          <>
            <dt>Completed</dt>
            <dd>{new Date(run.completed_at).toLocaleString()}</dd>
          </>
        ) : null}
        <dt>Source</dt>
        <dd>
          <code>{run.source_filename ?? 'unknown'}</code>
        </dd>
        <dt>Rows total</dt>
        <dd>{run.rows_total}</dd>
        <dt>Imported</dt>
        <dd>{run.rows_imported}</dd>
        <dt>Quarantined</dt>
        <dd>{run.rows_quarantined}</dd>
      </dl>

      {run.quarantine_reason_summary && run.quarantine_reason_summary.length > 0 ? (
        <>
          <h2>Quarantine reasons</h2>
          <ul>
            {run.quarantine_reason_summary.map((s) => (
              <li key={s.reason ?? 'unknown'}>
                {s.reason} — <strong>{s.count}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Quarantined rows</h2>
      {run.quarantine_rows.length === 0 ? (
        <EmptyState title="No rows quarantined" />
      ) : (
        <table className="psms-table">
          <thead>
            <tr>
              <th>Row #</th>
              <th>Reason</th>
              <th>Raw payload</th>
            </tr>
          </thead>
          <tbody>
            {run.quarantine_rows.map((row) => (
              <tr key={row.quarantine_id}>
                <td>{row.row_number}</td>
                <td>{row.reason}</td>
                <td>
                  <details>
                    <summary>Show payload</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(row.raw_payload, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function short(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
