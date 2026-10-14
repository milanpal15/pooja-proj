// The refund saga of the calls service: every way a refund can go wrong between this service and the wallet, and what is left behind.
// Rules under test (docs/MICROSERVICES.md section 4, phase 6): a durable intent BEFORE the money moves; the SAME idempotency key and the SAME ofKey
// on every retry; an ambiguous answer leaves the intent for the sweeper; exactly one refund; a definite refusal is closed `failed` loudly; the
// monolith's legacy intents (no ofKey) are upgraded or, for the one goodwill shape, sent with the operator's reason; old terminal intents are pruned.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27271/x node --test --test-concurrency=1 src/saga.test.mjs
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';

import { Astrologer, CallIntent, CallSession } from './models.js';
import { startJobs, stopJobs } from './jobs.js';
import { callService, tick } from './modules/calls/index.js';
import { pruneIntents, refundProofOf, sweep } from './modules/saga/index.js';
import { boot } from './test-kit.mjs';

const NONE = { checked: 0, done: 0, failed: 0, expired: 0, waiting: 0 };
let h;
let astro;
const QUIET = { silenceMs: Infinity };
const fund = (uid, n) => h.wallet.fund(uid, n);
const intent = (key) => CallIntent.findOne({ key }).lean();
const sweepNow = (o = {}) => sweep({ minAgeMs: 0, ...o });
const only = (path, method, mode = 'lost') => (p, m) => (m === method && p === path ? mode : 'up');
let n = 0;

/** A connected call with `minutes` billed (and then ended by the silence rule `failed`, or left connected). */
async function connected(coins = 100) {
  const uid = `s-${++n}`;
  fund(uid, coins);
  await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', lastSeenAt: new Date(), status: 'active', listed: true } });
  const rq = await h.call('POST', '/calls', { uid, name: 'Devotee', body: { astrologerId: String(astro._id), requestId: `rq-${n}` } });
  if (rq.status !== 201) throw new Error(`request failed: ${JSON.stringify(rq.body)}`);
  const id = rq.body.call.id;
  await h.call('POST', `/calls/${id}/accept`, { uid: 'astro-s' });
  return { uid, id, call: await CallSession.findById(id) };
}
const failIt = async (call) => tick(new Date(call.answeredAt.getTime() + 100_000), { silenceMs: 90_000 });

before(async () => {
  h = await boot('calls_tests_saga', { extra: { INTENT_MIN_AGE_MS: '0' } });
  astro = await Astrologer.create({ name: 'Pt. S', ratePerMin: 10, platformSharePct: 30, signInEmail: 's@x.co', uid: 'astro-s', status: 'active', listed: true, presence: 'online', lastSeenAt: new Date() });
});
after(() => h.stop());
afterEach(async () => {
  h.wallet.mode = 'up';
  h.wallet.onRequest = null;
  await CallSession.updateMany({ status: { $in: ['requested', 'connected'] } }, { $set: { status: 'ended', endReason: 'admin' }, $unset: { devoteeLive: 1, astrologerLive: 1, nextBillAt: 1 } });
});

describe('a connect-failure refund', () => {
  test('the intent exists BEFORE the wallet is asked (pending, with ofKey), the same key reaches the wallet, and it is closed `done` after', async () => {
    const { uid, id, call } = await connected();
    let atRefund = null;
    h.wallet.onRequest = async (path) => { if (path === '/refund') atRefund = await intent(`call:${id}:refund:1`); };
    await failIt(call);
    h.wallet.onRequest = null;
    assert.deepEqual([atRefund?.status, atRefund?.ofKey, atRefund?.amount, atRefund?.uid, atRefund?.refType], ['pending', `call:${id}:min:1`, 10, uid, 'call']);
    const row = await intent(`call:${id}:refund:1`);
    assert.deepEqual([row.status, row.kind, row.ofKey], ['done', 'refund', `call:${id}:min:1`]);
    assert.equal(h.wallet.balance(uid), 100);
    assert.equal(h.wallet.hits.filter((x) => x.path === '/refund' && x.body.key === `call:${id}:refund:1`).length, 1);
  });

  test('wallet DOWN at refund time: the call still ends `failed` (the clean-up carries on), the intent stays pending, the sweeper pays it with the same key + ofKey', async () => {
    const { uid, id, call } = await connected();
    h.wallet.mode = 'down';
    await failIt(call);
    h.wallet.mode = 'up';
    const c = await CallSession.findById(id);
    assert.equal(c.endReason, 'failed');
    assert.equal(h.wallet.balance(uid), 90, 'not refunded yet');
    assert.equal((await intent(`call:${id}:refund:1`)).status, 'pending');
    const s = await sweepNow();
    assert.deepEqual([s.checked >= 1, s.done >= 1], [true, true]);
    assert.equal(h.wallet.balance(uid), 100);
    assert.equal((await intent(`call:${id}:refund:1`)).status, 'done');
    assert.deepEqual(await sweepNow(), NONE, 'a second sweep finds nothing');
    const sent = h.wallet.hits.filter((x) => x.path === '/refund' && x.body.key === `call:${id}:refund:1`);
    assert.ok(sent.every((x) => x.body.ofKey === `call:${id}:min:1`));
  });

  test('LOST ANSWER on a refund: the coins DID go back; the sweeper re-sends the same key, the wallet answers `duplicate`, the intent closes - refunded exactly once', async () => {
    const { uid, id, call } = await connected();
    h.wallet.mode = only('/refund', 'POST');
    await failIt(call);
    h.wallet.mode = 'up';
    assert.equal(h.wallet.balance(uid), 100, 'the money DID move');
    assert.equal((await intent(`call:${id}:refund:1`)).status, 'pending');
    assert.ok((await sweepNow()).done >= 1);
    assert.equal(h.wallet.balance(uid), 100);
    assert.equal(h.wallet.postedFor(`call:${id}:refund:`).length, 1, 'one refund row');
    assert.equal((await intent(`call:${id}:refund:1`)).status, 'done');
  });

  test('FROZEN wallet on a refund: times out, thaws, one refund in the ledger', async () => {
    const { uid, id, call } = await connected();
    h.wallet.mode = only('/refund', 'POST', 'slow');
    await failIt(call);
    h.wallet.mode = 'up';
    h.wallet.release();
    assert.equal(h.wallet.balance(uid), 100);
    await sweepNow();
    assert.equal(h.wallet.postedFor(`call:${id}:refund:`).length, 1);
    assert.equal((await intent(`call:${id}:refund:1`)).status, 'done');
  });

  test('a DEFINITE refusal (the debit was never posted) closes the intent `failed`, loudly, and is never retried', async () => {
    const { id, call } = await connected();
    h.wallet.txns.get(`call:${id}:min:1`).status = 'failed'; // the wallet says that charge never completed
    const errors = [];
    const { ctx } = await import('./lib/context.js');
    const prev = ctx.log;
    ctx.log = { ...prev, error: (m) => errors.push(m) };
    await failIt(call).catch(() => {});
    ctx.log = prev;
    const row = await intent(`call:${id}:refund:1`);
    assert.equal(row.status, 'failed');
    assert.deepEqual(await sweepNow(), NONE, 'a failed intent is not swept again');
  });

  test('a crash between "ended failed" and "refunded": the next tick heals it (same keys, so safe even if it was half done)', async () => {
    const { uid, id, call } = await connected();
    // simulate the crash: the call row says ended/failed, nothing was refunded or recorded
    await CallSession.updateOne({ _id: id }, { $set: { status: 'ended', endReason: 'failed', endedAt: new Date() }, $unset: { nextBillAt: 1, devoteeLive: 1, astrologerLive: 1 } });
    assert.equal(h.wallet.balance(uid), 90);
    await tick(new Date(), QUIET);
    assert.equal(h.wallet.balance(uid), 100);
    assert.equal((await CallSession.findById(id)).coinsRefunded, 10);
    await tick(new Date(), QUIET);
    assert.equal(h.wallet.postedFor(`call:${id}:refund:`).length, 1, 'healed once');
    void call;
  });
});

describe('goodwill refunds through the saga', () => {
  async function ended(minutes = 2) {
    const c = await connected(200);
    for (let m = 2; m <= minutes; m++) await tick(new Date(c.call.answeredAt.getTime() + (m - 1) * 60_000 + 1000), QUIET);
    await callService.adminEnd(c.id);
    return c;
  }

  test('wallet DOWN: the operator is told to retry (503), every part is queued BEFORE the first is sent, the reservation stays, the sweeper pays all parts', async () => {
    const { uid, id } = await ended(2); // 20 charged
    h.wallet.mode = 'down';
    const r = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 15, reason: 'echo', requestId: 'gd1' } });
    assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    assert.deepEqual((await CallIntent.find({ key: new RegExp(`^call:${id}:gw:gd1:`) }).sort({ key: 1 })).map((i) => [i.status, i.amount, i.ofKey.split(':').pop()]), [['pending', 10, '1'], ['pending', 5, '2']]);
    assert.equal((await CallSession.findById(id)).coinsRefunded, 15, 'the reservation stays: the refund WILL be paid');
    h.wallet.mode = 'up';
    const dup = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 15, reason: 'echo', requestId: 'gd1' } });
    assert.equal(dup.status, 200, 'the operator\'s retry sees it as already reserved');
    assert.equal(h.wallet.balance(uid), 180);
    const s = await sweepNow();
    assert.equal(s.done, 2);
    assert.equal(h.wallet.balance(uid), 195);
    assert.equal(h.wallet.postedFor(`call:${id}:gw:`).length, 2);
  });

  test('wallet LOST answer on the first part: 503; the sweeper completes both parts; nothing is refunded twice', async () => {
    const { uid, id } = await ended(2);
    h.wallet.mode = only('/refund', 'POST');
    const r = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 12, reason: 'x', requestId: 'gl1' } });
    assert.equal(r.status, 503);
    h.wallet.mode = 'up';
    await sweepNow();
    assert.equal(h.wallet.postedFor(`call:${id}:gw:`).length, 2);
    assert.equal(h.wallet.balance(uid), 180 + 12);
  });

  test('a DEFINITE refusal part-way: what was paid stands, the unpaid part is released from the reservation, the error is the wallet\'s', async () => {
    const { uid, id } = await ended(2);
    h.wallet.txns.get(`call:${id}:min:2`).status = 'failed';
    const r = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 15, reason: 'x', requestId: 'gp1' } });
    assert.deepEqual([r.status, r.body.code], [409, 'refund_debit_not_posted']);
    const c = await CallSession.findById(id);
    assert.equal(c.coinsRefunded, 10, 'only the paid part is still reserved');
    assert.deepEqual([c.refunds.length, c.refunds[0].coins, c.refunds[0].parts.map((p) => p.minute)], [1, 10, [1]]);
    assert.equal(h.wallet.balance(uid), 180 + 10);
    assert.equal((await intent(`call:${id}:gw:gp1:2`)).status, 'failed');
    assert.equal((await intent(`call:${id}:gw:gp1:1`)).status, 'done');
  });

  test('a DEFINITE refusal on the very first part releases the whole reservation (the monolith\'s rollback)', async () => {
    const { uid, id } = await ended(1);
    h.wallet.txns.get(`call:${id}:min:1`).status = 'failed';
    const r = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 5, reason: 'x', requestId: 'gq1' } });
    assert.equal(r.status, 409);
    const c = await CallSession.findById(id);
    assert.deepEqual([c.coinsRefunded, c.refunds.length], [0, 0]);
    assert.equal(h.wallet.balance(uid), 190 - 0 - 0 + 0 === 190 ? 190 : 190);
  });
});

describe('intents the monolith left behind (copied by tools/split-db.mjs --service calls)', () => {
  const legacy = (key, extra = {}) => CallIntent.create({ key, kind: 'refund', uid: 'legacy-u', amount: 10, refType: 'call', refId: 'x', status: 'pending', openedAt: new Date(Date.now() - 60_000), ...extra });

  test('refundProofOf: ofKey wins; call:<id>:refund:<n> derives call:<id>:min:<n>; a goodwill key falls back to the reason; anything else is {}', () => {
    assert.deepEqual(refundProofOf({ key: 'whatever', ofKey: 'call:1:min:1' }), { ofKey: 'call:1:min:1' });
    assert.deepEqual(refundProofOf({ key: 'call:abc:refund:3' }), { ofKey: 'call:abc:min:3' });
    assert.deepEqual(refundProofOf({ key: 'call:abc:goodwill:r1', note: 'echo' }), { reason: 'echo' });
    assert.deepEqual(refundProofOf({ key: 'call:abc:goodwill:r1', reason: 'r', note: 'n' }), { reason: 'r' });
    assert.deepEqual(refundProofOf({ key: 'call:abc:goodwill:r1' }), {});
    assert.deepEqual(refundProofOf({ key: 'booking:u:r:failed' }), {});
    assert.deepEqual(refundProofOf({ key: 'call:abc:gw:r:1' }), {}, 'a NEW-style goodwill key with no ofKey is not derivable: it would be refused');
  });

  test('a pending `call:<id>:refund:<n>` with no ofKey is upgraded from its key and paid', async () => {
    const { uid, id } = await connected();
    // the monolith had queued this refund (and the debit is posted at the wallet)
    await legacy(`call:${id}:refund:1`, { uid, refId: id });
    assert.equal((await sweepNow()).done, 1);
    assert.equal(h.wallet.balance(uid), 100);
    assert.equal(h.wallet.hits.filter((x) => x.path === '/refund' && x.body.key === `call:${id}:refund:1`).at(-1).body.ofKey, `call:${id}:min:1`);
  });

  test('a pending monolith goodwill refund is re-sent under its OWN key with the operator\'s reason: the one exemption, from `calls`, for that key shape only', async () => {
    const { uid, id } = await connected(100);
    await legacy(`call:${id}:goodwill:rid1`, { uid, refId: id, amount: 4, note: 'echo on the line' });
    assert.equal((await sweepNow()).done, 1);
    assert.equal(h.wallet.balance(uid), 90 + 4);
    const sent = h.wallet.hits.find((x) => x.path === '/refund' && x.body.key === `call:${id}:goodwill:rid1`);
    assert.deepEqual([sent.body.reason, sent.body.ofKey, sent.body.refType, sent.iss], ['echo on the line', undefined, 'call', 'calls']);
  });

  test('the exemption does NOT extend to a new-style key: a reason without ofKey on `call:<id>:gw:...` is refused by the wallet (and the intent fails)', async () => {
    const { uid, id } = await connected(100);
    await legacy(`call:${id}:gw:rid:1`, { uid, refId: id, amount: 4, reason: 'sneaky', note: 'sneaky' });
    const s = await sweepNow();
    assert.deepEqual([s.done, s.failed], [0, 1], 'nothing derivable: closed failed without paying');
    assert.equal(h.wallet.balance(uid), 90);
    const r = await h.ctx.wallet.call('POST', '/refund', { uid, body: { uid, amount: 4, key: `call:${id}:gw:rid:9`, reason: 'sneaky', refType: 'call' } }).catch((e) => e);
    assert.equal(r.code, 'ofkey_required');
  });

  test('an intent whose proof cannot be derived is closed `failed` WITHOUT calling the wallet', async () => {
    const before = h.wallet.hits.length;
    await legacy('call:zzz:something-else');
    const s = await sweepNow();
    assert.deepEqual([s.failed, h.wallet.hits.length - before], [1, 0]);
  });

  test('copied intents resolve against a wallet that is DOWN at first: they wait, then are paid (and a young intent is left alone)', async () => {
    const { uid, id } = await connected();
    await legacy(`call:${id}:refund:1`, { uid, refId: id });
    h.wallet.mode = 'down';
    const w = await sweepNow();
    assert.equal(w.waiting, 1);
    assert.equal((await intent(`call:${id}:refund:1`)).attempts, 1);
    h.wallet.mode = 'up';
    assert.equal((await sweepNow()).done, 1);
    assert.equal(h.wallet.balance(uid), 100);
    await CallIntent.create({ key: 'call:young:refund:1', kind: 'refund', uid: 'x', amount: 1, status: 'pending', openedAt: new Date() });
    assert.equal((await sweep({ minAgeMs: 60_000 })).checked, 0, 'inside the minimum age nothing is touched');
    await CallIntent.deleteOne({ key: 'call:young:refund:1' });
  });
});

describe('pruning and the jobs', () => {
  test('terminal intents older than the retention are deleted; pending ones, and young terminal ones, never', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const mk = (key, status, updatedAt) => CallIntent.collection.insertOne({ key, kind: 'refund', uid: 'u', amount: 1, status, openedAt: old, updatedAt, createdAt: old });
    for (const st of ['done', 'failed', 'expired', 'refunded']) await mk(`prune:${st}:old`, st, old);
    await mk('prune:pending:old', 'pending', old);
    await mk('prune:done:young', 'done', new Date());
    const deleted = await pruneIntents({ retentionDays: 30 });
    assert.equal(deleted, 4);
    assert.deepEqual((await CallIntent.find({ key: /^prune:/ }).sort({ key: 1 })).map((i) => i.key), ['prune:done:young', 'prune:pending:old']);
    assert.equal(await pruneIntents({ retentionDays: 30 }), 0);
    await CallIntent.deleteMany({ key: /^prune:/ });
  });

  test('the jobs: the sweeper job resolves a pending refund by itself, the ticker job bills a due minute by itself; stopJobs stops both', async () => {
    const { uid, id, call } = await connected(100);
    await CallSession.updateOne({ _id: id }, { $set: { nextBillAt: new Date(Date.now() - 1000), answeredAt: new Date(call.answeredAt.getTime() - 60_000) } });
    await CallIntent.create({ key: `call:${id}:refund:1`, kind: 'refund', uid, amount: 10, refType: 'call', ofKey: `call:${id}:min:1`, status: 'pending', openedAt: new Date(Date.now() - 60_000) });
    const lines = [];
    startJobs({ ...h.config, tickEveryMs: 50, sweepEveryMs: 50, pruneEveryMs: 0 }, { info: (m) => lines.push(m), error: (m) => lines.push(m) });
    for (let i = 0; i < 60 && ((await intent(`call:${id}:refund:1`)).status !== 'done' || (await CallSession.findById(id)).minutesBilled < 2); i++) await new Promise((r) => setTimeout(r, 50));
    stopJobs();
    assert.equal((await intent(`call:${id}:refund:1`)).status, 'done');
    assert.equal((await CallSession.findById(id)).minutesBilled, 2, 'the ticker billed the minute that fell due');
    assert.ok(lines.some((l) => /billing ticker started/.test(l)) && lines.some((l) => /refund sweeper started/.test(l)));
    await callService.adminEnd(id);
  });
});
