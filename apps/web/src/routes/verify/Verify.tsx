// OUT-08 — Public certificate verification page.
//
// Reachable without auth at /verify/:id. The endpoint is also the QR
// code target on each issued certificate, so an employer scanning the
// QR lands here directly. The response is small by design (no PII
// beyond student name and dates).

import { useQuery } from '@tanstack/react-query';

import { ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { CertificateVerification } from '../../lib/api/types.js';

interface Props {
  id: string;
}

export function VerifyCertificate({ id }: Props): JSX.Element {
  const query = useQuery<CertificateVerification>({
    queryKey: ['verify', id],
    queryFn: () => api.get(`/certificates/verify/${id}`),
    retry: false,
  });

  return (
    <main className="psms-auth" aria-labelledby="verify-heading">
      <h1 id="verify-heading">Knox PSMS certificate verification</h1>
      <p className="psms-list__meta">
        Knox Community College issues this certificate as proof of an
        ICT student's industry placement or community-service hours.
      </p>

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />

      {query.data ? <VerifyResult result={query.data} /> : null}

      <p className="psms-auth__hint">
        Reference: <code>{id}</code>
      </p>
    </main>
  );
}

function VerifyResult({ result }: { result: CertificateVerification }): JSX.Element {
  if (result.status === 'NOT_FOUND') {
    return (
      <section>
        <h2>
          <span className="psms-status psms-status--rejected">Not found</span>
        </h2>
        <p>
          No certificate matches this reference. The link may be a
          forgery or the certificate may have been removed.
        </p>
      </section>
    );
  }
  if (result.status === 'REVOKED' || !result.valid) {
    return (
      <section>
        <h2>
          <span className="psms-status psms-status--revoked">Revoked</span>
        </h2>
        <p>
          This certificate was issued by Knox PSMS but has since been
          revoked. Treat it as invalid.
        </p>
        <Facts result={result} />
      </section>
    );
  }
  return (
    <section>
      <h2>
        <span className="psms-status psms-status--approved">Valid</span>
      </h2>
      <p>This certificate is genuine and currently in effect.</p>
      <Facts result={result} />
    </section>
  );
}

function Facts({ result }: { result: CertificateVerification }): JSX.Element {
  return (
    <dl className="psms-detail__facts">
      {result.student_name ? (
        <>
          <dt>Student</dt>
          <dd>{result.student_name}</dd>
        </>
      ) : null}
      {result.organisation_name ? (
        <>
          <dt>Host organisation</dt>
          <dd>{result.organisation_name}</dd>
        </>
      ) : null}
      {result.placement_dates ? (
        <>
          <dt>Placement window</dt>
          <dd>
            {result.placement_dates.start} → {result.placement_dates.end}
          </dd>
        </>
      ) : null}
      {typeof result.hours_completed === 'number' ? (
        <>
          <dt>Hours completed</dt>
          <dd>{result.hours_completed}</dd>
        </>
      ) : null}
      {result.signature_hash ? (
        <>
          <dt>Signature SHA-256</dt>
          <dd>
            <code style={{ wordBreak: 'break-all' }}>{result.signature_hash}</code>
          </dd>
        </>
      ) : null}
    </dl>
  );
}
