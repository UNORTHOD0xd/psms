// CLAUDE.md frontend rule 4: every API-calling component has a
// loading and an error state. A bare spinner is acceptable; missing
// is not.

export function LoadingState({ label = 'Loading…' }: { label?: string }): JSX.Element {
  return (
    <div role="status" aria-live="polite" className="psms-loading">
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: JSX.Element;
}): JSX.Element {
  return (
    <div className="psms-empty">
      <h2>{title}</h2>
      {detail ? <p>{detail}</p> : null}
      {action ? <div className="psms-empty__action">{action}</div> : null}
    </div>
  );
}
