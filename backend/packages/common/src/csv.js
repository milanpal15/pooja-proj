/**
 * Minimal RFC 4180 CSV for the dashboard exports.
 *
 * Spreadsheet formula injection: a cell that starts with `=`, `@`, a tab or a carriage return - or with `+` / `-` followed by anything but a plain
 * number or phone-like run - is prefixed with `'` so Excel / Sheets show it as text. A phone number (`+919800000001`) stays as it is.
 */
const PLAIN_NUMBER = /^[+-]?\d[\d\s-]*$/;

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? String(value) : String(value);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !PLAIN_NUMBER.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells) => `${cells.map(csvCell).join(',')}\r\n`;

/** Hard ceiling on one export (docs/USERS.md section 2). */
export const EXPORT_CAP = 50_000;
/** Rows per internal page while exporting. */
export const EXPORT_PAGE = 1000;
