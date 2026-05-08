interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: Props): JSX.Element | null {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Pagination" className="psms-pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        ← Prev
      </button>
      <span aria-live="polite">
        {start}–{end} of {total}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= last}
        aria-label="Next page"
      >
        Next →
      </button>
    </nav>
  );
}
