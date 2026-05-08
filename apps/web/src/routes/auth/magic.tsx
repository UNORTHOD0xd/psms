// PRC-03 — magic-link consume.
// The route reads ?token=… from the URL, posts to the API, and on success
// the API sets a session cookie scoped to the placement. The user's
// browser then has a real session and we redirect to the supervisor home.

import { useEffect, useState } from 'react';

import { ErrorBanner, LoadingState } from '../../components/index.js';
import { api, ProblemError } from '../../lib/api/client.js';
import { useAuth } from '../../lib/auth/AuthProvider.js';

export function MagicLinkRoute(): JSX.Element {
  const auth = useAuth();
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const token = new URL(window.location.href).searchParams.get('token');
    if (!token) {
      setError(new Error('Missing token in magic link'));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await api.post(`/auth/magic-link/consume?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        await auth.refresh();
        // After refresh the router will re-render based on auth.role; we
        // hand control back to it by replacing the URL so the token leaves
        // the browser history.
        window.history.replaceState({}, '', '/');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ProblemError && err.status === 410) {
          setError(new Error('This link has expired or has already been used.'));
        } else {
          setError(err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth]);

  if (error) {
    return (
      <main className="psms-auth">
        <h1>Link not accepted</h1>
        <ErrorBanner error={error} />
        <p>Please ask the placement coordinator to issue a fresh link.</p>
      </main>
    );
  }

  return (
    <main className="psms-auth">
      <h1>Signing you in…</h1>
      <LoadingState label="Verifying your secure link." />
    </main>
  );
}
