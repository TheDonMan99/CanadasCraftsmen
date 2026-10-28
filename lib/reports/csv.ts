// CSV export. Cells that a spreadsheet would read as a formula (=, +, -, @) are
// prefixed with an apostrophe, so customer text can't run as a formula.

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  return [columns.map((c) => cell(c.header)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))].join('\r\n') + '\r\n';
}

export const centsToDollars = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));
