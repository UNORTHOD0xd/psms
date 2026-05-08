// Tiny RFC 4180-compliant CSV writer. We deliberately do not pull in a
// CSV library for this — escaping is small enough to own.

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(values: ReadonlyArray<unknown>): string {
  return values.map(csvEscape).join(',');
}

export function csvDocument(
  header: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): string {
  // CRLF per RFC 4180.
  return [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}
