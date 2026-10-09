/**
 * Pure pooja logic: countdown, name/address validation, bill maths, filters,
 * booking payload + idempotency signature, status timeline.
 *
 *   node --test src/features/poojas/lib/poojas-lib.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));

function load(file, cache = new Map()) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const out = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const req = (spec) => {
    if (!spec.startsWith('.')) throw new Error(`unexpected import ${spec} in ${abs}`);
    return load(path.resolve(path.dirname(abs), `${spec}.ts`), cache);
  };
  new Function('exports', 'require', 'module', out)(mod.exports, req, mod);
  return mod.exports;
}
const m = (f) => load(path.join(here, f));
const { countdownTo } = m('countdown.ts');
const { resizeNames, validateNames, validateAddress, isFormValid } = m('names.ts');
const { billFor } = m('bill.ts');
const { balanceAfter, shortBy } = load(path.join(here, '../../../lib/coin-bill.ts'));
const { toQuery, activeCount, toggleFilter, NO_FILTERS } = m('filters.ts');
const { bookingBody, bookingSignature } = m('payload.ts');
const { formatPoojaDate } = load(path.join(here, '../../../lib/pooja-dates.ts'));

test('countdown: null deadline hides it', () => {
  assert.equal(countdownTo(null, 0), null);
  assert.equal(countdownTo('garbage', 0), null);
});

test('countdown: splits days/hours/minutes/seconds and closes at zero', () => {
  const end = Date.UTC(2026, 9, 10, 12, 30, 0);
  const now = end - ((2 * 86400 + 13 * 3600 + 41 * 60 + 8) * 1000);
  const c = countdownTo(new Date(end).toISOString(), now);
  assert.deepEqual([c.days, c.hours, c.minutes, c.seconds, c.closed], [2, 13, 41, 8, false]);
  const past = countdownTo(new Date(end).toISOString(), end + 5000);
  assert.deepEqual([past.days, past.seconds, past.closed], [0, 0, true]);
});

test('names: resize keeps typed values and prefills only the first empty name', () => {
  const two = resizeNames([{ name: 'Asha', gotra: 'K' }], 2, 'Ignored');
  assert.deepEqual(two, [{ name: 'Asha', gotra: 'K' }, { name: '', gotra: '' }]);
  const fresh = resizeNames([], 4, 'Coco');
  assert.equal(fresh.length, 4);
  assert.equal(fresh[0].name, 'Coco');
  assert.equal(fresh[1].name, '');
  assert.equal(resizeNames(fresh, 1).length, 1);
});

test('names: count must equal persons; length limits mirror the server', () => {
  const ok = { name: 'Asha Devi', gotra: '' };
  assert.deepEqual(validateNames([ok, ok], 2), [undefined, undefined]);
  assert.ok(validateNames([ok], 2).every(Boolean), 'wrong count is invalid');
  assert.equal(validateNames([{ name: 'A', gotra: '' }], 1)[0], 'name_short');
  assert.equal(validateNames([{ name: ' A ', gotra: '' }], 1)[0], 'name_short', 'trimmed');
  assert.equal(validateNames([{ name: 'x'.repeat(61), gotra: '' }], 1)[0], 'name_long');
  assert.equal(validateNames([{ name: 'Asha', gotra: 'g'.repeat(41) }], 1)[0], 'gotra_long');
});

test('address is required only when prasad is on', () => {
  const blank = { line1: '', city: '', pincode: '' };
  const names = [{ name: 'Asha', gotra: '' }];
  assert.equal(isFormValid(names, 1, false, blank), true);
  assert.equal(isFormValid(names, 1, true, blank), false);
  assert.deepEqual(Object.keys(validateAddress({ line1: '12 MG Road', city: 'Pune', pincode: '41100' })), ['pincode']);
  assert.equal(isFormValid(names, 1, true, { line1: '12 MG Road', city: 'Pune', pincode: '411001' }), true);
});

test('bill: prasad fee only when chosen; balance after may go negative', () => {
  assert.deepEqual(billFor(851, 99, true), { packageCoins: 851, prasadCoins: 99, total: 950 });
  assert.deepEqual(billFor(851, 99, false), { packageCoins: 851, prasadCoins: 0, total: 851 });
  assert.equal(balanceAfter(1240, 950), 290);
  assert.equal(balanceAfter(null, 950), null);
  assert.equal(balanceAfter(100, 950), -850);
  assert.equal(shortBy(100, 950), 850);
  assert.equal(shortBy(2000, 950), 0);
  assert.equal(shortBy(null, 950), 0);
});

test('filters: blank values are dropped, toggling the selected value clears it', () => {
  assert.deepEqual(toQuery(NO_FILTERS), { temple: undefined, festival: undefined, tithi: undefined, place: undefined, q: undefined });
  const f = toggleFilter(NO_FILTERS, 'place', 'Varanasi');
  assert.equal(toQuery(f, 'kashi').place, 'Varanasi');
  assert.equal(toQuery(f, 'kashi').temple, 'kashi');
  assert.equal(activeCount(f), 1);
  assert.equal(activeCount(toggleFilter(f, 'place', 'Varanasi')), 0);
  assert.equal(toQuery({ ...NO_FILTERS, q: '  durga ' }).q, 'durga');
});

test('payload: trims, and sends the address only with prasad; never a price', () => {
  const base = { poojaSlug: 's', packageKey: 'partner', names: [{ name: ' Asha ', gotra: ' K ' }], address: { line1: ' 1 Rd ', city: ' Pune', pincode: '411001 ' } };
  const no = bookingBody({ ...base, prasad: false });
  assert.deepEqual(no.names, [{ name: 'Asha', gotra: 'K' }]);
  assert.ok(!('address' in no));
  const yes = bookingBody({ ...base, prasad: true });
  assert.deepEqual(yes.address, { line1: '1 Rd', city: 'Pune', pincode: '411001' });
  for (const k of Object.keys(yes)) assert.ok(!/price|coins|total|amount/i.test(k), k);
});

test('signature: stable for the same order, different when anything changes', () => {
  const base = { poojaSlug: 's', packageKey: 'a', names: [{ name: 'Asha', gotra: '' }], prasad: false, address: { line1: '', city: '', pincode: '' } };
  assert.equal(bookingSignature(base), bookingSignature({ ...base, names: [{ name: ' Asha ', gotra: '' }] }));
  assert.notEqual(bookingSignature(base), bookingSignature({ ...base, packageKey: 'b' }));
  assert.notEqual(bookingSignature(base), bookingSignature({ ...base, names: [{ name: 'Asha2', gotra: '' }] }));
  assert.notEqual(bookingSignature(base), bookingSignature({ ...base, prasad: true }));
});

test('dates: null / junk means "every day"', () => {
  assert.equal(formatPoojaDate(null, 'en'), null);
  assert.equal(formatPoojaDate('nope', 'en'), null);
  assert.ok(formatPoojaDate('2026-10-11', 'en').includes('11'));
});
