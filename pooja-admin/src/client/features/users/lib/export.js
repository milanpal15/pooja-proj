import { buildExportQuery } from './query.js';

/**
 * Export CSV. The server streams it (admin-visible fields only, capped at 50 000 rows, audited with the filter and
 * the row count), so the dashboard only decides WHAT to ask for and tells the operator what they are about to take.
 */
export const EXPORT_CAP = 50000;

export function exportFilename(now = new Date(), mode = 'filtered') {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `users-${mode === 'selected' ? 'selected-' : ''}${d}.csv`;
}

/**
 * @param {{ filters, sort, selectedIds: string[], total: number|null, now?: Date }} p
 * @returns {{ mode:'selected'|'filtered', query: object, count: number|null, capped: boolean, title: string, lines: string[], confirmLabel: string }}
 */
export function exportPlan({ filters, sort, selectedIds = [], total = null, now = new Date() }) {
  const base = buildExportQuery(filters, sort, now);
  if (selectedIds.length) {
    return {
      mode: 'selected',
      query: { ...base, ids: selectedIds.join(',') },
      count: selectedIds.length,
      capped: false,
      title: `Export ${selectedIds.length} selected ${selectedIds.length === 1 ? 'user' : 'users'}`,
      lines: ['The file includes each person’s sign-in contact exactly as stored.', 'The export is recorded in the audit log with your name and the number of rows.'],
      confirmLabel: 'Export CSV',
    };
  }
  const capped = total != null && total > EXPORT_CAP;
  const count = total == null ? null : Math.min(total, EXPORT_CAP);
  return {
    mode: 'filtered',
    query: base,
    count,
    capped,
    title: count == null ? 'Export the matching users' : `Export ${count.toLocaleString('en-IN')} ${count === 1 ? 'user' : 'users'}`,
    lines: [
      Object.keys(base).some((k) => !['sort', 'dir'].includes(k)) ? 'Everything matching the current search and filters is included, not just the rows loaded.' : 'This is every user.',
      ...(capped ? [`Only the first ${EXPORT_CAP.toLocaleString('en-IN')} rows are exported.`] : count == null ? [`The file holds at most ${EXPORT_CAP.toLocaleString('en-IN')} rows.`] : []),
      'The file includes each person’s sign-in contact exactly as stored.',
      'The export is recorded in the audit log with your name, the filter and the number of rows.',
    ],
    confirmLabel: 'Export CSV',
  };
}

/** Data rows in a CSV text (header excluded), honouring quoted newlines. */
export function csvDataRows(text) {
  let rows = 0;
  let inQuote = false;
  let sawData = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && (c === '\n' || c === '\r')) {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      if (sawData) rows += 1;
      sawData = false;
    } else sawData = true;
  }
  if (sawData) rows += 1;
  return Math.max(0, rows - 1);
}

/**
 * Exporting a selection depends on the server honouring `ids`. If it ignored them it would hand over EVERYONE, so
 * the file is only saved when it holds exactly what was asked for.
 */
export function selectionExportOk(csvText, selectedCount) {
  return csvDataRows(csvText) === selectedCount;
}
