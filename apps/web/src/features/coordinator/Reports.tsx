// Coordinator reports surface.
//
// Three jobs from one page:
//   1. Kick off an accreditation pack (PRC-10 / OUT-06). The endpoint is
//      async — POST returns 202 with a pack_id, then we poll until the
//      job is SUCCEEDED and surface the download URL.
//   2. Download the hours-shortfall report (OUT-10) as CSV.
//   3. Open a per-student transcript (OUT-07) by user_id.
//
// Audit-log export (OUT-09) is admin-only and lives in Phase 5.

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  ErrorBanner,
  Field,
  FieldShell,
  LoadingState,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';

interface PackJob {
  pack_id: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  download_url?: string;
  error?: string;
  created_at: string;
}

export function CoordinatorReports(): JSX.Element {
  return (
    <section>
      <h1>Reports</h1>
      <div className="psms-grid">
        <AccreditationPackCard />
        <HoursShortfallCard />
        <TranscriptCard />
      </div>
    </section>
  );
}

// ── Accreditation pack ────────────────────────────────────────────────────

function AccreditationPackCard(): JSX.Element {
  const [packId, setPackId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
  });

  const start = useMutation<PackJob, unknown, void>({
    mutationFn: () =>
      api.post('/reports/accreditation-pack', {
        ...(filters.start_date ? { start_date: filters.start_date } : {}),
        ...(filters.end_date ? { end_date: filters.end_date } : {}),
      }),
    onSuccess: (job) => setPackId(job.pack_id),
  });

  const poll = useQuery<PackJob>({
    queryKey: ['coordinator', 'accreditation-pack', packId],
    queryFn: () => api.get(`/reports/accreditation-pack/${packId}`),
    enabled: Boolean(packId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      return data.status === 'RUNNING' ? 2000 : false;
    },
  });

  return (
    <article className="psms-card">
      <h2>Accreditation pack</h2>
      <p className="psms-list__meta">
        ZIP of CSVs (placements, organisations, evaluations, hours summaries)
        plus a cover PDF. Optional date window.
      </p>
      <ErrorBanner error={start.error || poll.error} />

      <form
        className="psms-form psms-form--inline"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate();
        }}
      >
        <div className="psms-form__row">
          <Field
            label="Start date"
            type="date"
            value={filters.start_date}
            onChange={(e) =>
              setFilters((f) => ({ ...f, start_date: e.target.value }))
            }
          />
          <Field
            label="End date"
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
          />
        </div>
        <Button type="submit" loading={start.isPending}>
          Build pack
        </Button>
      </form>

      {packId ? (
        <div>
          <p className="psms-list__meta">
            Pack <code>{packId}</code> · {poll.data?.status ?? 'loading'}
          </p>
          {poll.data?.status === 'SUCCEEDED' && poll.data.download_url ? (
            <a
              href={poll.data.download_url}
              className="psms-btn psms-btn--primary"
              target="_blank"
              rel="noreferrer"
            >
              Download ZIP
            </a>
          ) : null}
          {poll.data?.status === 'FAILED' ? (
            <ErrorBanner error={new Error(poll.data.error ?? 'Pack build failed')} />
          ) : null}
          {poll.data?.status === 'RUNNING' ? <LoadingState label="Building…" /> : null}
        </div>
      ) : null}
    </article>
  );
}

// ── Hours shortfall ────────────────────────────────────────────────────────

async function downloadCsv(path: string, query: Record<string, string | number>, filename: string): Promise<void> {
  const url = new URL(`/api/v1${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

function HoursShortfallCard(): JSX.Element {
  const [days, setDays] = useState(60);
  const [threshold, setThreshold] = useState(0.5);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <article className="psms-card">
      <h2>Hours shortfall</h2>
      <p className="psms-list__meta">
        Students whose approved hours are below the threshold and whose
        placement closes within the window. CSV download.
      </p>
      <ErrorBanner error={error} />

      <form
        className="psms-form psms-form--inline"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          downloadCsv(
            '/reports/hours-shortfall',
            { days, threshold },
            `hours-shortfall-${new Date().toISOString().slice(0, 10)}.csv`,
          )
            .catch((err: unknown) => setError(err))
            .finally(() => setBusy(false));
        }}
      >
        <div className="psms-form__row">
          <Field
            label="Window (days)"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
          <FieldShell label="Threshold">
            <select
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            >
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
            </select>
          </FieldShell>
        </div>
        <Button type="submit" loading={busy}>
          Download CSV
        </Button>
      </form>
    </article>
  );
}

// ── Transcript ─────────────────────────────────────────────────────────────

function TranscriptCard(): JSX.Element {
  const [userId, setUserId] = useState('');
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(userId);

  return (
    <article className="psms-card">
      <h2>Student transcript</h2>
      <p className="psms-list__meta">
        Per-student PDF: programme, placements, hours, evaluations, certificate.
      </p>
      <Field
        label="Student user ID (UUID)"
        value={userId}
        onChange={(e) => setUserId(e.target.value.trim())}
        placeholder="00000000-0000-0000-0000-000000000000"
      />
      <a
        href={isUuid ? `/api/v1/students/${userId}/transcript` : undefined}
        className={`psms-btn psms-btn--primary${isUuid ? '' : ' psms-btn--disabled'}`}
        aria-disabled={!isUuid}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (!isUuid) e.preventDefault();
        }}
      >
        Open PDF
      </a>
    </article>
  );
}
