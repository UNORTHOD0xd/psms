import { ProblemError } from '../lib/api/client.js';

export function ErrorBanner({ error }: { error: unknown }): JSX.Element | null {
  if (!error) return null;
  let title = 'Something went wrong';
  let detail: string | undefined;
  let requestId: string | undefined;

  if (error instanceof ProblemError) {
    title = error.title;
    detail = error.detail;
    requestId = error.request_id;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div role="alert" className="psms-error-banner">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {requestId ? <p className="psms-error-banner__rid">Request ID: {requestId}</p> : null}
    </div>
  );
}
