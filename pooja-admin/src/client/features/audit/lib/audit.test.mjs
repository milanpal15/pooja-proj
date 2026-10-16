import assert from 'node:assert/strict';
import test from 'node:test';

import { toCsv } from '../../../lib/csv.js';
import { CSV_COLUMNS, NO_FILTERS, buildParams, describe, hasDetail, hasFilters, rangeError, resultTone } from './audit.js';

test('params drop blanks and carry the cursor', () => {
  const p = buildParams({ ...NO_FILTERS, operator: ' asha ', method: 'PUT', from: '2026-10-01', to: '2026-10-02' }, 'c1');
  assert.equal(p.operator, 'asha');
  assert.equal(p.area, undefined);
  assert.equal(p.method, 'PUT');
  assert.equal(p.before, 'c1');
  assert.equal(p.limit, 50);
  assert.ok(Date.parse(p.from) < Date.parse(p.to));
  assert.ok(Date.parse(p.to) - Date.parse(p.from) > 86400000, 'to is the END of its day');
  assert.equal(buildParams(NO_FILTERS).before, undefined);
});

test('filters and range', () => {
  assert.equal(hasFilters(NO_FILTERS), false);
  assert.equal(hasFilters({ ...NO_FILTERS, area: 'content' }), true);
  assert.ok(rangeError({ ...NO_FILTERS, from: '2026-10-05', to: '2026-10-01' }));
  assert.equal(rangeError({ ...NO_FILTERS, from: '2026-10-01', to: '2026-10-01' }), '');
});

test('describe, detail, tone', () => {
  assert.equal(describe({ method: 'PUT', path: '/api/admin/version-policy' }), 'Changed admin/version-policy');
  assert.equal(describe({ method: 'DELETE', path: '/api/content/deities/4' }), 'Deleted content/deities/4');
  assert.equal(hasDetail({ before: { a: 1 } }), true);
  assert.equal(hasDetail({}), false);
  assert.deepEqual(resultTone(202), ['success', '202 ok']);
  assert.equal(resultTone(403)[0], 'warning');
});

test('csv of the visible page, formula-safe', () => {
  const csv = toCsv(CSV_COLUMNS, [{ at: '2026-10-16T10:00:00Z', operator: '=cmd', role: 'admin', area: 'releases', method: 'PUT', path: '/p', status: 200, selfApproved: true, after: { a: 'x,y' } }]);
  const [head, row] = csv.split('\r\n');
  assert.ok(head.startsWith('When,Operator'));
  assert.ok(row.includes("'=cmd"), 'leading = is neutralised');
  assert.ok(row.includes('yes'));
  assert.ok(row.includes('""a"":""x,y""') || row.includes('{""a""'), 'json quoted');
});
