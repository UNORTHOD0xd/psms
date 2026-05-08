import { useQuery } from '@tanstack/react-query';

import { EmptyState, ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Certificate, Page } from '../../lib/api/types.js';

export function CertificateList(): JSX.Element {
  const query = useQuery<Page<Certificate>>({
    queryKey: ['student', 'certificates'],
    queryFn: () => api.get('/me/certificates'),
  });

  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorBanner error={query.error} />;
  if (!query.data || query.data.data.length === 0) {
    return (
      <EmptyState
        title="No certificates yet"
        detail="Once your placement closes with a final evaluation, your completion certificate appears here."
      />
    );
  }

  return (
    <section>
      <h1>Completion certificates</h1>
      <ul className="psms-list">
        {query.data.data.map((c) => (
          <li key={c.certificate_id} className="psms-list__row">
            <div>
              <strong>Certificate</strong>
              <p className="psms-list__meta">
                Issued {c.issued_at?.slice(0, 10)}
                {c.revoked ? ' · REVOKED' : ''}
              </p>
              <p className="psms-list__meta" title="Signature hash">
                <code>{c.signature_hash.slice(0, 16)}…</code>
              </p>
            </div>
            {c.revoked ? (
              <span className="psms-status psms-status--revoked">Revoked</span>
            ) : (
              <a
                href={c.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="psms-btn psms-btn--secondary"
              >
                Download PDF
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
