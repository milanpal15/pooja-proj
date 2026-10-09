/**
 * Client-side CSV export of whatever a table is showing.
 *
 * `columns`: [{ header, value: (row) => string|number|null }].
 * A text cell that starts with = + - @ would be run as a formula by a
 * spreadsheet (a devotee can choose their own name), so those get a leading
 * apostrophe. Plain numbers are written as they are.
 */
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadCsv(filename, text) {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
