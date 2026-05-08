// Generic fallback for uncaught render errors and route-load failures.
// Wired in via TanStack Router's `defaultErrorComponent` so every
// route gets the same behaviour without per-route plumbing.

import { Button } from './Button.js';
import { ErrorBanner } from './ErrorBanner.js';

interface Props {
  error: unknown;
  reset?: () => void;
}

export function RouteError({ error, reset }: Props): JSX.Element {
  return (
    <main className="psms-shell__main" aria-labelledby="route-error-heading">
      <section className="psms-card" style={{ maxWidth: '36rem', margin: '4rem auto' }}>
        <h1 id="route-error-heading">Something went wrong</h1>
        <p className="psms-list__meta">
          The page failed to load. This has been recorded — try again, or
          return to your dashboard.
        </p>
        <ErrorBanner error={error} />
        <div className="psms-form__row">
          {reset ? <Button onClick={reset}>Try again</Button> : null}
          <a className="psms-btn psms-btn--secondary" href="/">
            Home
          </a>
        </div>
      </section>
    </main>
  );
}
