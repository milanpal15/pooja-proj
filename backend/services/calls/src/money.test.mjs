// Money on a call: what happens to the minutes when the wallet or the settings misbehave, and that several billing clocks (two instances against one
// database) never charge or earn a minute twice. Rules under test (docs/MICROSERVICES.md section 4, phase 6): the SAME key `call:<id>:min:<n>` on
// every retry; a wallet that cannot answer never ends a call on a guess and never bills one on a guess; the gate reads fail CLOSED; the display reads
// degrade to "absent".
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27271/x node --test --test-concurrency=1 src/money.test.mjs
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';

import { Astrologer, AstrologerEarning, CallIntent, CallSession } from './models.js';
import { callService, tick } from './modules/calls/index.js';
import { boot } from './test-kit.mjs';

let h;
let astro;
const QUIET = { silenceMs: Infinity };
const only = (path, method, mode) => (p, m) => (m === method && p === path ? mode : 'up');
let n = 0;
const keysFor = (id) => [...h.wallet.txns.keys()].filter((k) => k.startsWith(`call:${id}:min:`));
const debitHits = (id) => h.wallet.hits.filter((x) => x.path === '/debit' && x.body.key.startsWith(`call:${id}:min:`));

async function ringing(coins = 100) {
  const uid = `m-${++n}`;
  h.wallet.fund(uid, coins);
  await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', lastSeenAt: new Date(), status: 'active', listed: true } });
  const r = await h.call('POST', '/calls', { uid, name: 'Devotee', body: { astrologerId: String(astro._id), requestId: `rq-${n}` } });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return { uid, id: r.body.call.id };
}
const accept = (id) => h.call('POST', `/calls/${id}/accept`, { uid: 'astro-m' });

before(async () => {
  h = await boot('calls_tests_money');
  astro = await Astrologer.create({ name: 'Pt. M', ratePerMin: 10, platformSharePct: 30, signInEmail: 'm@x.co', uid: 'astro-m', status: 'active', listed: true, presence: 'online', lastSeenAt: new Date() });
});
after(() => h.stop());
afterEach(async () => {
  h.wallet.mode = 'up';
  h.wallet.onRequest = null;
  h.settings.down = false;
  h.identity.down = false;
  await CallSession.updateMany({ status: { $in: ['requested', 'connected'] } }, { $set: { status: 'ended', endReason: 'admin' }, $unset: { devoteeLive: 1, astrologerLive: 1, nextBillAt: 1 } });
});

describe('the gate fails CLOSED', () => {
  test('wallet unreachable when a call is requested: 503 wallet_unavailable, no call, nothing assumed (never a 0 balance, never an open door)', async () => {
    const uid = 'gate-1';
    h.wallet.fund(uid, 100);
    for (const mode of ['down', 'broken', 'hang', 'forbidden']) {
      h.wallet.mode = mode;
      const r = await h.call('POST', '/calls', { uid, body: { astrologerId: String(astro._id), requestId: `g-${mode}` } });
      assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable'], mode);
      assert.equal(await CallSession.countDocuments({ devoteeUid: uid }), 0, mode);
    }
  });

  test('engagement unreachable when a call is requested: 503 settings_unavailable (minMinutes and the kill switch are read FRESH, never guessed)', async () => {
    h.wallet.fund('gate-2', 100);
    h.settings.down = true;
    const r = await h.call('POST', '/calls', { uid: 'gate-2', body: { astrologerId: String(astro._id), requestId: 'g-s' } });
    assert.deepEqual([r.status, r.body.code], [503, 'settings_unavailable']);
    assert.equal(await CallSession.countDocuments({ devoteeUid: 'gate-2' }), 0);
  });

  test('identity down: a call can still be requested (the name comes from the signed token, else is blank); a push failure never fails the request', async () => {
    h.identity.down = true;
    h.push.throws = true;
    const { id } = await ringing();
    const c = await CallSession.findById(id);
    assert.equal(c.devoteeName, 'Devotee', 'the name the signed token carried');
    const uid = 'gate-3';
    h.wallet.fund(uid, 100);
    await CallSession.updateMany({ status: 'requested' }, { $set: { status: 'ended', endReason: 'admin' }, $unset: { devoteeLive: 1 } });
    const r = await h.call('POST', '/calls', { uid, body: { astrologerId: String(astro._id), requestId: 'g-id' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.call.devotee.name, '', 'no name anywhere: blank, not an error');
    h.push.throws = false;
  });

  test('the view\'s balance is DISPLAY only: wallet down = the call view is still served, with the balance simply absent', async () => {
    const { uid, id } = await ringing();
    await accept(id);
    h.wallet.mode = 'down';
    const v = await h.call('GET', `/calls/${id}`, { uid });
    assert.equal(v.status, 200);
    assert.equal(v.body.call.balance, undefined);
    assert.equal(v.body.call.lowBalance, false, 'never a made-up 0');
    assert.equal(v.body.call.status, 'connected');
  });
});

describe('a frozen wallet cannot hold the polling view hostage', () => {
  test('the view\'s balance read gives up after WALLET_DISPLAY_TIMEOUT_MS (1.5 s here, far under the BFF\'s own timeout) and, once it has failed, the next polls skip it for a few seconds', async () => {
    const { uid, id } = await ringing();
    await accept(id);
    await new Promise((ok) => setTimeout(ok, 5200)); // the earlier test's backoff window (5 s) has passed
    h.wallet.mode = 'hang';
    const t0 = Date.now();
    const first = await h.call('GET', `/calls/${id}`, { uid });
    const took = Date.now() - t0;
    assert.equal(first.status, 200);
    assert.ok(took >= 1400 && took < 2400, `the first poll waited the display timeout, not the money timeout (${took} ms)`);
    assert.equal(first.body.call.balance, undefined);
    const t1 = Date.now();
    const second = await h.call('GET', `/calls/${id}`, { uid });
    assert.ok(Date.now() - t1 < 500, `the next poll does not wait at all (${Date.now() - t1} ms)`);
    assert.equal(second.status, 200);
    assert.equal(second.body.call.status, 'connected');
    h.wallet.mode = 'up';
  }, { timeout: 20_000 });
});

describe('a wallet that cannot answer never ends a call on a guess and never bills one on a guess', () => {
  test('wallet DOWN at accept: the call is connected and unbilled; the ticker defers; when the wallet is back minute 1 is charged ONCE and earned once', async () => {
    const { uid, id } = await ringing();
    h.wallet.mode = 'down';
    const a = await accept(id);
    assert.equal(a.status, 200);
    assert.deepEqual([a.body.call.status, a.body.call.minutesBilled, a.body.call.coinsCharged], ['connected', 0, 0]);
    assert.equal(h.wallet.balance(uid), 100);
    const c = await CallSession.findById(id);
    for (let i = 1; i <= 3; i++) assert.equal((await tick(new Date(c.answeredAt.getTime() + i * 1000), QUIET)).walletUnavailable, 1, 'deferred, not failed');
    const still = await CallSession.findById(id);
    assert.deepEqual([still.status, still.minutesBilled, still.nextBillAt.getTime()], ['connected', 0, c.nextBillAt.getTime()], 'nextBillAt did not move');
    h.wallet.mode = 'up';
    await tick(new Date(c.answeredAt.getTime() + 5000), QUIET);
    await tick(new Date(c.answeredAt.getTime() + 6000), QUIET);
    assert.equal(h.wallet.balance(uid), 90, 'charged once');
    assert.deepEqual(keysFor(id), [`call:${id}:min:1`]);
    assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 1);
    assert.equal((await CallSession.findById(id)).minutesBilled, 1);
    assert.equal((await Astrologer.findById(astro._id)).presence, 'busy');
  });

  test('wallet LOST ANSWER at accept (it charged, we never heard): connected + unbilled; the ticker asks again with the SAME key and the wallet answers duplicate - one debit', async () => {
    const { uid, id } = await ringing();
    h.wallet.mode = only('/debit', 'POST', 'lost');
    assert.equal((await accept(id)).body.call.minutesBilled, 0);
    assert.equal(h.wallet.balance(uid), 90, 'the money DID move');
    h.wallet.mode = 'up';
    const c = await CallSession.findById(id);
    await tick(new Date(c.answeredAt.getTime() + 2000), QUIET);
    const hits = debitHits(id);
    assert.ok(hits.length >= 2 && hits.every((x) => x.body.key === `call:${id}:min:1`), 'the same key every time');
    assert.equal(h.wallet.balance(uid), 90, 'not charged twice');
    assert.deepEqual([(await CallSession.findById(id)).minutesBilled, (await CallSession.findById(id)).coinsCharged], [1, 10]);
  });

  test('FROZEN wallet (SIGSTOP-like): the tick times out and defers, the thaw processes the held debit, the next tick finds it done - exactly one debit per minute key', async () => {
    const { uid, id } = await ringing(100);
    await accept(id);
    const c = await CallSession.findById(id);
    h.wallet.mode = 'slow';
    const t0 = Date.now();
    const out = await tick(new Date(c.answeredAt.getTime() + 61_000), QUIET);
    assert.ok(Date.now() - t0 >= 1500, 'waited for the wallet timeout');
    assert.equal(out.walletUnavailable, 1);
    assert.equal((await CallSession.findById(id)).minutesBilled, 1, 'minute 2 not recorded on a guess');
    h.wallet.mode = 'up';
    h.wallet.release();
    await tick(new Date(c.answeredAt.getTime() + 62_000), QUIET);
    await tick(new Date(c.answeredAt.getTime() + 63_000), QUIET);
    assert.equal(h.wallet.balance(uid), 80);
    assert.deepEqual(keysFor(id).sort(), [`call:${id}:min:1`, `call:${id}:min:2`]);
    assert.equal((await CallSession.findById(id)).minutesBilled, 2);
    assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 2);
  });

  test('wallet down for several minutes mid-call: the call stays connected, and once back it catches up every started minute under its own key, once each', async () => {
    const { uid, id } = await ringing(100);
    await accept(id);
    const c = await CallSession.findById(id);
    h.wallet.mode = 'broken';
    await tick(new Date(c.answeredAt.getTime() + 61_000), QUIET);
    await tick(new Date(c.answeredAt.getTime() + 125_000), QUIET);
    assert.equal((await CallSession.findById(id)).status, 'connected');
    h.wallet.mode = 'up';
    await tick(new Date(c.answeredAt.getTime() + 126_000), QUIET);
    assert.equal((await CallSession.findById(id)).minutesBilled, 3, 'minutes 1, 2 and 3 have all started');
    assert.deepEqual(keysFor(id).sort(), [1, 2, 3].map((k) => `call:${id}:min:${k}`));
    assert.equal(h.wallet.balance(uid), 70);
    assert.deepEqual((await AstrologerEarning.find({ callId: id }).sort({ minute: 1 })).map((e) => e.minute), [1, 2, 3]);
  });

  test('a call that goes quiet while the wallet is down is still ended by silence (it is not kept alive by an outage), and what was never charged is not refunded', async () => {
    const { uid, id } = await ringing(100);
    h.wallet.mode = 'down';
    await accept(id);
    const c = await CallSession.findById(id);
    await tick(new Date(c.answeredAt.getTime() + 100_000), { silenceMs: 90_000 });
    const done = await CallSession.findById(id);
    assert.equal(done.status, 'ended');
    assert.equal(done.minutesBilled, 0);
    assert.equal(h.wallet.balance(uid), 100);
    assert.equal(await CallIntent.countDocuments({ key: new RegExp(`^call:${id}:`) }), 0, 'no refund of a charge that was never recorded');
  });

  test('out of coins is only declared on a DEFINITE 402, never on an outage', async () => {
    h.settings.values.minMinutes = '1';
    const { uid, id } = await ringing(12); // 10 for minute 1 leaves 2
    h.settings.values.minMinutes = '3';
    await accept(id);
    const c = await CallSession.findById(id);
    h.wallet.mode = 'down';
    await tick(new Date(c.answeredAt.getTime() + 61_000), QUIET);
    assert.equal((await CallSession.findById(id)).status, 'connected', 'an outage is not "out of coins"');
    h.wallet.mode = 'up';
    await tick(new Date(c.answeredAt.getTime() + 62_000), QUIET);
    const end = await CallSession.findById(id);
    assert.deepEqual([end.status, end.endReason, end.minutesBilled, end.endedAt.getTime()], ['ended', 'out_of_coins', 1, c.answeredAt.getTime() + 60_000]);
    assert.equal(h.wallet.balance(uid), 2);
  });

  test('settings unreadable at billing time defers the minute (nothing charged), and is billed once readable', async () => {
    const { uid, id } = await ringing(100);
    await accept(id);
    const c = await CallSession.findById(id);
    h.settings.down = true;
    assert.equal((await tick(new Date(c.answeredAt.getTime() + 61_000), QUIET)).walletUnavailable, 1);
    assert.equal(h.wallet.balance(uid), 90);
    h.settings.down = false;
    await tick(new Date(c.answeredAt.getTime() + 62_000), QUIET);
    assert.equal(h.wallet.balance(uid), 80);
  });
});

describe('several billing clocks at once (two instances, one database)', () => {
  test('N concurrent ticks over a call with 5 minutes due: each minute is charged once, earned once, counted once', async () => {
    const { uid, id } = await ringing(200);
    await accept(id);
    const c = await CallSession.findById(id);
    const now = new Date(c.answeredAt.getTime() + 4 * 60_000 + 1000); // minutes 2..5 have started
    await Promise.all(Array.from({ length: 6 }, () => tick(now, QUIET)));
    const after = await CallSession.findById(id);
    assert.deepEqual([after.minutesBilled, after.coinsCharged], [5, 50]);
    assert.equal(h.wallet.balance(uid), 150);
    assert.deepEqual(keysFor(id).sort(), [1, 2, 3, 4, 5].map((k) => `call:${id}:min:${k}`));
    assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 5);
    assert.equal(h.wallet.postedFor(`call:${id}:min:`).length, 5);
  });

  test('many calls, several clocks, a wallet that blinks: still one debit per (call, minute) and the books agree with the ledger', async () => {
    await Astrologer.deleteMany({ uid: /^cm-/ });
    const calls = [];
    for (let i = 0; i < 4; i++) {
      const a = await Astrologer.create({ name: `CM${i}`, ratePerMin: 10, platformSharePct: 30, signInEmail: `cm${i}@x.co`, uid: `cm-${i}`, status: 'active', listed: true, presence: 'online', lastSeenAt: new Date() });
      const uid = `many-${i}`;
      h.wallet.fund(uid, 500);
      const r = await h.call('POST', '/calls', { uid, body: { astrologerId: String(a._id), requestId: `many-${i}` } });
      await h.call('POST', `/calls/${r.body.call.id}/accept`, { uid: `cm-${i}` });
      calls.push({ uid, id: r.body.call.id });
    }
    const base = (await CallSession.findById(calls[0].id)).answeredAt.getTime();
    for (let round = 1; round <= 6; round++) {
      h.wallet.mode = round % 2 ? 'up' : only('/debit', 'POST', 'lost');
      await Promise.all([tick(new Date(base + round * 60_000 + 1000), QUIET), tick(new Date(base + round * 60_000 + 1000), QUIET), tick(new Date(base + round * 60_000 + 1000), QUIET)]);
    }
    h.wallet.mode = 'up';
    await Promise.all([tick(new Date(base + 6 * 60_000 + 2000), QUIET), tick(new Date(base + 6 * 60_000 + 2000), QUIET)]);
    for (const { uid, id } of calls) {
      const c = await CallSession.findById(id);
      assert.equal(c.minutesBilled, 7, `call ${id}`);
      assert.equal(h.wallet.postedFor(`call:${id}:min:`).length, 7);
      assert.equal(h.wallet.balance(uid), 500 - 70);
      assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 7);
      assert.equal(c.coinsCharged, 70);
    }
    await Astrologer.deleteMany({ uid: /^cm-/ });
  });

  test('the earning row is a unique upsert: two writers racing the same (call, minute) leave one row and no error', async () => {
    const { id } = await ringing(100);
    await accept(id);
    const c = await CallSession.findById(id);
    const stale = await CallSession.findById(id);
    // the wallet part is idempotent; both copies then race the counter bump and the upsert
    const rs = await Promise.allSettled(Array.from({ length: 10 }, () => callService.billNextMinute(stale, new Date(c.answeredAt.getTime() + 61_000))));
    assert.ok(rs.every((r) => r.status === 'fulfilled'), JSON.stringify(rs.filter((r) => r.status === 'rejected').map((r) => String(r.reason))));
    assert.equal(await AstrologerEarning.countDocuments({ callId: id, minute: 2 }), 1);
    assert.equal((await CallSession.findById(id)).minutesBilled, 2);
  });
});

describe('the heal pass', () => {
  test('a refund the wallet REFUSED is not opened again on every tick', async () => {
    const { id } = await ringing(100);
    await accept(id);
    h.wallet.txns.get(`call:${id}:min:1`).status = 'failed';
    const c = await CallSession.findById(id);
    await tick(new Date(c.answeredAt.getTime() + 100_000), { silenceMs: 90_000 }).catch(() => {});
    assert.equal((await CallIntent.findOne({ key: `call:${id}:refund:1` })).status, 'failed');
    const hits = h.wallet.hits.filter((x) => x.path === '/refund' && x.body.key === `call:${id}:refund:1`).length;
    await tick(new Date(), QUIET);
    await tick(new Date(), QUIET);
    assert.equal(h.wallet.hits.filter((x) => x.path === '/refund' && x.body.key === `call:${id}:refund:1`).length, hits, 'no more attempts');
  });
});
