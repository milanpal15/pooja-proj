// The calls service carries copies of pieces of the monolith. When the monolith checkout is next to backend/ (a normal clone), fail on any drift:
// the devotee pseudonym and the masking helpers, the audio-provider resolution, the IST day boundaries, the presence rule, and the SHAPE of the four
// collections (so the DB split copies rows the service reads as they were written). Every deliberate difference is asserted here by name.
// Run: node --test --test-concurrency=1 src/parity.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveRtcProvider } from './lib/rtc.js';
import { createRedactor } from './lib/redact.js';
import { effectivePresence, PRESENCE_FRESH_MS, PUSH_REACHABLE_MS, Astrologer } from './modules/astrologers/astrologer.model.js';
import { CallSession } from './modules/calls/call.model.js';
import { AstrologerEarning, Payout } from './modules/payouts/payout.model.js';
import { istBoundaries } from './modules/payouts/payout.service.js';
import { planGoodwill } from './modules/calls/call.service.js';

const mono = (f) => new URL(`../../../../pooja-api/src/${f}`, import.meta.url);
const have = existsSync(fileURLToPath(mono('access/redact.js')));
const skip = !have && 'pooja-api not checked out next to backend/';

test('the devotee pseudonym, the masks and the call / astrologer row redaction are the monolith\'s for the same secret', { skip }, async () => {
  process.env.ADMIN_SESSION_SECRET = 'parity-secret-parity-secret-12';
  const api = await import(mono('access/redact.js'));
  const mine = createRedactor('parity-secret-parity-secret-12');
  for (const uid of ['a1', 'uid-with-dashes', 'ÜNICODE', '', undefined, 'x'.repeat(200)]) assert.equal(mine.pseudonym(uid), api.pseudonym(uid), String(uid));
  for (const e of ['rao@example.com', '', 'nope', '@x.co', undefined]) assert.equal(mine.maskEmail(e), api.maskEmail(e), String(e));
  for (const p of ['+919876543210', '', '98765', '+1 (555) 010-9999', undefined]) assert.equal(mine.maskPhone(p), api.maskPhone(p), String(p));
  const row = { id: 'c1', devoteeName: 'Asha Kumar', coins: 10 };
  const call = { devoteeUid: 'a1' };
  const rows = [{ id: 'a', name: 'A', signInEmail: 'a@x.co', signInPhone: '+919000000001' }, { id: 'b', name: 'B', signInEmail: '', signInPhone: '' }];
  for (const can of [() => false, () => true, (p) => p === 'devotees:view', (p) => p === 'astrologers:edit', undefined]) {
    const req = can ? { can } : {};
    assert.deepEqual(mine.redactCallRow(row, call, req), api.redactCallRow(row, call, req));
    assert.deepEqual(mine.redactAstrologerRows(rows, req), api.redactAstrologerRows(rows, req));
  }
});

test('the audio provider resolves exactly as the monolith\'s does, for a matrix of environments (and issues the same shape)', { skip }, async () => {
  const api = await import(mono('modules/calls/rtc.provider.js'));
  const A = { AGORA_APP_ID: 'a'.repeat(32), AGORA_APP_CERTIFICATE: 'b'.repeat(32) };
  const envs = [{}, { NODE_ENV: 'production' }, { NODE_ENV: 'production', RTC_PROVIDER: 'mock' }, { RTC_PROVIDER: 'mock' }, { RTC_PROVIDER: 'MOCK' }, { RTC_PROVIDER: 'agora' }, { RTC_PROVIDER: 'agora', ...A },
    A, { NODE_ENV: 'production', ...A }, { RTC_PROVIDER: 'mock', ...A }, { RTC_PROVIDER: 'zoom' }, { AGORA_APP_ID: 'x' }, { NODE_ENV: 'production', RTC_PROVIDER: 'agora', AGORA_APP_ID: 'x' }];
  for (const env of envs) {
    const get = (f) => { try { return { name: f(env).name }; } catch (e) { return { status: e.status, code: e.code, message: e.message }; } };
    assert.deepEqual(get(resolveRtcProvider), get(api.getRtcProvider), JSON.stringify(env));
  }
  assert.deepEqual(api.RTC_UID, { devotee: 1, astrologer: 2 });
  const ours = await resolveRtcProvider(A).issue({ channel: 'call-1', uid: 1 });
  const theirs = await api.getRtcProvider(A).issue({ channel: 'call-1', uid: 1 });
  assert.deepEqual(Object.keys(ours), Object.keys(theirs));
  assert.equal(ours.token.slice(0, 3), theirs.token.slice(0, 3));
  assert.deepEqual(await resolveRtcProvider({}).issue({ channel: 'c', uid: 2 }), await api.getRtcProvider({}).issue({ channel: 'c', uid: 2 }));
});

test('IST boundaries and the presence rule are the monolith\'s', { skip }, async () => {
  const pay = await import(mono('modules/payouts/payout.service.js'));
  for (const d of ['2026-03-01T20:00:00Z', '2026-12-31T18:29:59Z', '2026-12-31T18:30:00Z', '2026-01-01T00:00:00Z']) {
    assert.deepEqual(istBoundaries(new Date(d)), pay.istBoundaries(new Date(d)), d);
  }
  const model = await import(mono('modules/astrologers/astrologer.model.js'));
  assert.equal(PRESENCE_FRESH_MS, model.PRESENCE_FRESH_MS);
  assert.equal(PUSH_REACHABLE_MS, 4 * 3600_000); // service-only; the monolith knows no push-reachable astrologers
  const now = Date.now();
  for (const a of [{ presence: 'busy' }, { presence: 'online', lastSeenAt: new Date(now - 10_000) }, { presence: 'online', lastSeenAt: new Date(now - 60_000) }, { presence: 'online' }, { presence: 'offline', lastSeenAt: new Date(now) }]) {
    assert.equal(effectivePresence(a, now), model.effectivePresence(a, now), JSON.stringify(a));
  }
});

test('the four collections have the monolith\'s fields (so a copied row reads as it was written); the differences are exactly the named ones', { skip }, async () => {
  const [A, C, P] = await Promise.all([import(mono('modules/astrologers/astrologer.model.js')), import(mono('modules/calls/call.model.js')), import(mono('modules/payouts/payout.model.js'))]);
  const paths = (m) => Object.keys(m.schema.paths).sort();
  const without = (list, ...gone) => list.filter((p) => !gone.includes(p));
  // astrologers: the service adds only the payout lease and `pushReachable` (background push; the monolith intentionally stays unchanged)
  assert.deepEqual(without(paths(Astrologer), 'payoutLock.id', 'payoutLock.until', 'pushReachable'), paths(A.Astrologer));
  // callsessions: the service adds only the minutes a goodwill refund reversed
  assert.deepEqual(without(paths(CallSession), 'refunds.parts'), paths(C.CallSession));
  assert.deepEqual(paths(AstrologerEarning), paths(P.AstrologerEarning));
  assert.deepEqual(paths(Payout), paths(P.Payout));
  assert.equal(Astrologer.collection.collectionName, A.Astrologer.collection.collectionName);
  assert.deepEqual([CallSession, AstrologerEarning, Payout].map((m) => m.collection.collectionName), [C.CallSession, P.AstrologerEarning, P.Payout].map((m) => m.collection.collectionName));
  assert.deepEqual([Astrologer, CallSession, AstrologerEarning, Payout].map((m) => m.collection.collectionName), ['astrologers', 'callsessions', 'astrologerearnings', 'payouts']);
  // indexes: identical. (The monolith used to declare a unique index on `devoteeLive` alone, which made `true` unique across ALL devotees —
  // one live call on the whole platform. It now declares the per-devotee index below, and drops the old one at boot.)
  const idx = (m) => m.schema.indexes().map(([k, o]) => JSON.stringify([k, o])).sort();
  assert.deepEqual(idx(Astrologer), idx(A.Astrologer));
  assert.deepEqual(idx(AstrologerEarning), idx(P.AstrologerEarning));
  assert.deepEqual(idx(CallSession), idx(C.CallSession));
  const live = (m) => m.schema.indexes().filter(([k]) => k.devoteeLive).map(([k]) => k);
  assert.deepEqual(live(C.CallSession), [{ devoteeUid: 1, devoteeLive: 1 }], 'the monolith: one live call per devotee');
  assert.deepEqual(live(CallSession), [{ devoteeUid: 1, devoteeLive: 1 }], 'the service: one live call per devotee');
});

test('goodwill planning: lowest free minutes first, never above a minute\'s charge, null when the free minutes cannot hold it', () => {
  const call = (refunds, minutesBilled = 3) => ({ minutesBilled, ratePerMinSnapshot: 10, refunds });
  assert.deepEqual(planGoodwill(call([]), 25), [{ minute: 1, coins: 10 }, { minute: 2, coins: 10 }, { minute: 3, coins: 5 }]);
  assert.deepEqual(planGoodwill(call([{ parts: [{ minute: 1, coins: 3 }] }]), 12), [{ minute: 2, coins: 10 }, { minute: 3, coins: 2 }]);
  assert.equal(planGoodwill(call([{ parts: [{ minute: 1, coins: 3 }, { minute: 2, coins: 1 }] }]), 15), null);
  assert.deepEqual(planGoodwill(call([{ requestId: 'legacy' }]), 7), [{ minute: 1, coins: 7 }], 'a refund the monolith recorded (no parts) claims no minute');
  assert.equal(planGoodwill(call([], 0), 1), null);
});
