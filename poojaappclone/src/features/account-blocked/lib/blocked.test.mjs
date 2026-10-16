/**
 * The account / device block: 403 body parsing (fail safe), message choice, IST formatting, the
 * try-again state machine, dedupe, the bus, and en/hi key parity.
 *
 *   node --test src/features/account-blocked/lib/blocked.test.mjs
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

const S = load(path.join(here, '../../../lib/api/block-signal.ts'));
const B = load(path.join(here, 'blocked.ts'));

const full = {
  code: 'account_blocked', error: 'Blocked', message: 'Spam', messageHi: 'स्पैम', until: '2026-10-30T13:00:00Z',
  support: { email: 'help@x.org', phone: '+911800123456' },
};

test('parseBlock reads a full body', () => {
  const b = S.parseBlock(403, full);
  assert.equal(b.code, 'account_blocked');
  assert.equal(b.message, 'Spam');
  assert.equal(b.messageHi, 'स्पैम');
  assert.equal(b.until, '2026-10-30T13:00:00Z');
  assert.deepEqual(b.support, { email: 'help@x.org', phone: '+911800123456' });
  assert.equal(S.parseBlock(403, { ...full, code: 'device_blocked' }).code, 'device_blocked');
});

test('parseBlock tolerates missing / unknown / bad fields', () => {
  const b = S.parseBlock(403, { code: 'device_blocked', until: null, extra: 1 });
  assert.deepEqual(b, { code: 'device_blocked', message: '', messageHi: '', until: null, support: { email: '', phone: '' } });
  assert.equal(S.parseBlock(403, { code: 'account_blocked', until: 'soon', message: 5, support: 'x' }).until, null);
  assert.equal(S.parseBlock(403, { code: 'account_blocked', support: { email: 3 } }).support.email, '');
});

test('FAIL SAFE: no / unknown code, wrong status or junk body is NOT a block', () => {
  assert.equal(S.parseBlock(403, { error: 'Forbidden' }), null);
  assert.equal(S.parseBlock(403, { code: 'forbidden' }), null);
  assert.equal(S.parseBlock(403, { code: 'insufficient_coins' }), null);
  assert.equal(S.parseBlock(401, full), null);
  assert.equal(S.parseBlock(500, full), null);
  for (const j of [null, undefined, 'x', 7, [], '<html>']) assert.equal(S.parseBlock(403, j), null);
  assert.equal(S.isBlockCode('account_blocked'), true);
  assert.equal(S.isBlockCode('maintenance'), false);
});

test('message selection by language, with the built-in fallback', () => {
  const b = { message: 'Spam', messageHi: 'स्पैम' };
  assert.equal(B.pickBlockMessage(b, 'hi', 'FB'), 'स्पैम');
  assert.equal(B.pickBlockMessage(b, 'en', 'FB'), 'Spam');
  assert.equal(B.pickBlockMessage({ message: 'Spam', messageHi: '  ' }, 'hi', 'FB'), 'Spam');
  assert.equal(B.pickBlockMessage({ message: '', messageHi: 'हि' }, 'en', 'FB'), 'FB');
  assert.equal(B.pickBlockMessage({ message: '', messageHi: '' }, 'hi', 'FB'), 'FB');
});

test('until is formatted in IST', () => {
  // 2026-10-30T13:00Z = 6:30 PM IST; 18:45Z = 00:15 next day IST.
  assert.equal(B.formatUntil('2026-10-30T13:00:00Z', 'en'), '30 Oct 2026, 6:30 PM');
  assert.equal(B.formatUntil('2026-10-30T18:45:00Z', 'en'), '31 Oct 2026, 12:15 AM');
  assert.match(B.formatUntil('2026-10-30T13:00:00Z', 'hi'), /^30 अक्तू 2026, 6:30 PM$/);
  assert.equal(B.formatUntil(null, 'en'), '');
  assert.equal(B.formatUntil('garbage', 'en'), '');
});

test('support: server wins, app config falls back, blank hides; urls are sanitised', () => {
  assert.deepEqual(B.pickSupport({ email: '', phone: '' }, { email: 'a@b.co', phone: '' }), { email: 'a@b.co', phone: '' });
  assert.deepEqual(B.pickSupport({ email: 's@x.io', phone: '1' }, { email: 'a@b.co', phone: '2' }), { email: 's@x.io', phone: '1' });
  assert.deepEqual(B.pickSupport({ email: '', phone: '' }, { email: '', phone: '' }), { email: '', phone: '' });
  assert.equal(B.telUrl('+91 (180) 012-3456'), 'tel:+911800123456');
  assert.equal(B.isEmail('help@x.org'), true);
  assert.equal(B.isEmail('not an email'), false);
});

const blk = S.parseBlock(403, full);

test('state machine: block, try again still blocked, then cleared', () => {
  let s = B.blockReducer(B.NO_BLOCK, { type: 'blocked', block: blk });
  assert.equal(s.block, blk);
  s = B.blockReducer(s, { type: 'check_start' });
  assert.equal(s.checking, true);
  s = B.blockReducer(s, { type: 'check_result', result: 'blocked' });
  assert.deepEqual([s.checking, s.lastCheck], [false, 'still']);
  s = B.blockReducer(s, { type: 'check_start' });
  assert.equal(s.lastCheck, null);
  s = B.blockReducer(s, { type: 'check_result', result: 'error' });
  assert.equal(s.lastCheck, 'error');
  assert.equal(s.block, blk);
  s = B.blockReducer(s, { type: 'check_start' });
  s = B.blockReducer(s, { type: 'check_result', result: 'ok' });
  assert.equal(s, B.NO_BLOCK);
});

test('state machine: no check without a block, no double check, stray results ignored', () => {
  assert.equal(B.blockReducer(B.NO_BLOCK, { type: 'check_start' }), B.NO_BLOCK);
  assert.equal(B.blockReducer(B.NO_BLOCK, { type: 'check_result', result: 'ok' }), B.NO_BLOCK);
  const s = B.blockReducer(B.blockReducer(B.NO_BLOCK, { type: 'blocked', block: blk }), { type: 'check_start' });
  assert.equal(B.blockReducer(s, { type: 'check_start' }), s);
});

test('dedupe: an identical repeated 403 returns the SAME state object', () => {
  const s = B.blockReducer(B.NO_BLOCK, { type: 'blocked', block: blk });
  const again = B.blockReducer(s, { type: 'blocked', block: S.parseBlock(403, full) });
  assert.equal(again, s);
  const changed = B.blockReducer(s, { type: 'blocked', block: S.parseBlock(403, { ...full, message: 'Other' }) });
  assert.notEqual(changed, s);
  // a repeat arriving mid-check does not abort the check
  const checking = B.blockReducer(s, { type: 'check_start' });
  assert.equal(B.blockReducer(checking, { type: 'blocked', block: blk }), checking);
  // clear is idempotent
  assert.equal(B.blockReducer(B.NO_BLOCK, { type: 'clear' }), B.NO_BLOCK);
  assert.equal(B.blockReducer(s, { type: 'clear' }), B.NO_BLOCK);
});

test('classifyCheck: ok, coded 403, 401 (session gone) and errors', () => {
  assert.equal(B.classifyCheck({ ok: true }), 'ok');
  assert.equal(B.classifyCheck({ ok: false, status: 403, isBlock: true }), 'blocked');
  assert.equal(B.classifyCheck({ ok: false, status: 401, isBlock: false }), 'ok');
  assert.equal(B.classifyCheck({ ok: false, status: 403, isBlock: false }), 'error');
  assert.equal(B.classifyCheck({ ok: false, status: null, isBlock: false }), 'error');
  assert.equal(B.classifyCheck({ ok: false, status: 503, isBlock: false }), 'error');
});

test('the bus delivers to subscribers, survives a throwing listener, and unsubscribes', () => {
  const seen = [];
  const off = S.onBlockSignal((b) => seen.push(b));
  const off2 = S.onBlockSignal(() => {
    throw new Error('boom');
  });
  S.emitBlockSignal(blk);
  assert.equal(seen.length, 1);
  off();
  off2();
  S.emitBlockSignal(blk);
  assert.equal(seen.length, 1);
});

test('i18n: the ab_* keys exist in en and hi and are non-empty', () => {
  const keys = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/^\s+(ab_\w+):\s*'([^']+)'/gm)].map((m) => m[1]);
  const en = keys(path.join(here, '../../../i18n/en/account-blocked.ts'));
  const hi = keys(path.join(here, '../../../i18n/hi/account-blocked.ts'));
  assert.ok(en.length >= 10);
  assert.deepEqual(en, hi);
});
