import { useQuery } from '@tanstack/react-query';

import { ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { LedgerSummary } from '../../lib/api/types.js';

export function LedgerView(): JSX.Element {
  const ledger = useQuery<LedgerSummary>({
    queryKey: ['student', 'ledger'],
    queryFn: () => api.get('/me/ledger'),
  });

  if (ledger.isPending) return <LoadingState />;
  if (ledger.error) return <ErrorBanner error={ledger.error} />;
  if (!ledger.data) return <p>No ledger yet.</p>;

  const l = ledger.data;
  const pct = Math.round(l.percentage_complete);

  return (
    <section>
      <h1>Service-hours ledger</h1>
      <p>
        You have <strong>{l.hours_verified}</strong> verified of{' '}
        <strong>{l.hours_required}</strong> required ({pct}%).
      </p>
      <progress
        value={l.hours_verified}
        max={l.hours_required}
        aria-label="Verified hours progress"
      >
        {pct}%
      </progress>
      <dl className="psms-detail__facts">
        <dt>Verified</dt>
        <dd>{l.hours_verified}</dd>
        <dt>Pending</dt>
        <dd>{l.hours_pending}</dd>
        <dt>Gap</dt>
        <dd>{l.gap_hours ?? l.hours_required - l.hours_verified}</dd>
        {l.eligibility ? (
          <>
            <dt>Eligibility</dt>
            <dd>{l.eligibility}</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}
