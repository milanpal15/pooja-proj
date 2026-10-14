// The call lifecycle, ported from pooja-api/src/modules/calls/calls.test.mjs and run through the REAL service app: auth refusals, every contract shape,
// request / accept / decline / cancel / end / rating, the billing minutes (incl. out-of-coins), silence and ring timeouts driven by a fake clock,
// concurrency, the goodwill refund, the kill switch, and the audio-provider resolution.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27271/x node --test --test-concurrency=1 src/calls.test.mjs
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { Astrologer, AstrologerEarning, CallSession } from './models.js';
import { resolveRtcProvider } from './lib/rtc.js';
import { tick } from './modules/calls/index.js';
import { EDITOR, VIEWER, boot, token } from './test-kit.mjs';

let h;
let astro;
const ASTRO_UID = 'astro-uid';
const fund = (uid, n) => h.wallet.fund(uid, n);
const goOnline = () => Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', lastSeenAt: new Date(), status: 'active', listed: true } });
const request = (uid, over = {}) => h.call('POST', '/calls', { uid, name: 'Asha Kumar', body: { astrologerId: String(astro._id), requestId: `r-${Math.random()}`, ...over } });
const accept = (id, uid = ASTRO_UID) => h.call('POST', `/calls/${id}/accept`, { uid });
const debits = (uid) => h.wallet.postedFor(`call:`).filter((t) => t.uid === uid && t.type === 'call_debit');
let n = 0;
const devotee = (coins) => { const uid = `dev-${++n}`; if (coins) fund(uid, coins); return uid; };
const QUIET = { silenceMs: Infinity };

before(async () => {
  h = await boot('calls_tests_lifecycle');
  astro = await Astrologer.create({
    name: 'Pt. Sharma', ratePerMin: 10, platformSharePct: 30, signInEmail: 'sharma@example.com',
    uid: ASTRO_UID, status: 'active', listed: true, presence: 'online', lastSeenAt: new Date(),
  });
});
after(() => h.stop());

describe('who may call what (the caller gate, the area gate, the token)', () => {
  test('no token, a bad token and a token from nobody we know are all 401', async () => {
    assert.equal((await h.call('GET', '/astrologers', { tok: null })).status, 401);
    assert.equal((await h.call('GET', '/astrologers', { tok: 'garbage' })).status, 401);
    assert.equal((await h.call('GET', '/astrologers', { iss: 'some-other-service' })).status, 401);
  });

  test('each route family accepts ONE kind of caller', async () => {
    const id = '000000000000000000000001';
    // devotee/astrologer routes: mobile-bff only
    for (const iss of ['admin-bff', 'identity']) {
      for (const [m, p] of [['POST', '/calls'], ['GET', `/calls/${id}`], ['POST', `/calls/${id}/accept`], ['GET', '/astrologer/me'], ['PUT', '/astrologer/me/presence'], ['GET', '/astrologer/me/earnings']]) {
        const r = await h.call(m, p, { uid: 'u1', iss, body: m === 'GET' ? undefined : {} });
        assert.equal(r.status, 403, `${iss} ${m} ${p}`);
        assert.equal(r.body.code, 'wrong_issuer');
      }
    }
    // operator routes: admin-bff only
    for (const iss of ['mobile-bff', 'identity']) {
      for (const [m, p] of [['GET', '/admin/astrologers'], ['POST', '/admin/astrologers'], ['GET', '/admin/calls'], ['POST', `/admin/calls/${id}/refund`], ['GET', '/admin/payouts/summary'], ['POST', '/admin/payouts']]) {
        assert.equal((await h.call(m, p, { iss, body: m === 'GET' ? undefined : {} })).status, 403, `${iss} ${m} ${p}`);
      }
    }
    // the sign-in claim: identity ONLY
    for (const iss of ['mobile-bff', 'admin-bff']) {
      assert.equal((await h.call('POST', '/directory/astrologers/claim', { iss, body: { decoded: { uid: 'x' } } })).status, 403, `${iss} claim`);
      assert.equal((await h.call('GET', '/directory/astrologers/active?uid=x', { iss })).status, 403, `${iss} active`);
    }
    // the public list: either BFF, not identity
    assert.equal((await h.call('GET', '/astrologers', { iss: 'mobile-bff', uid: 'u1' })).status, 200);
    assert.equal((await h.call('GET', '/astrologers', { iss: 'admin-bff' })).status, 200);
    assert.equal((await h.call('GET', '/astrologers', { iss: 'identity' })).status, 403);
    // an unknown path is a 403 for everyone (the last row refuses all), a known path a 404 only for a valid caller
    assert.equal((await h.call('GET', '/nothing-here', { iss: 'mobile-bff', uid: 'u1' })).status, 403);
  });

  test('the area gate: a viewer reads the call log, only an admin writes; an unmapped admin path is admin-only; no perms is 401', async () => {
    assert.equal((await h.call('GET', '/admin/calls', { perms: VIEWER })).status, 200);
    assert.equal((await h.call('GET', '/admin/calls', { perms: EDITOR })).status, 200);
    const w = await h.call('POST', '/admin/calls/000000000000000000000001/end', { perms: EDITOR });
    assert.deepEqual([w.status, w.body.code, w.body.needs], [403, 'forbidden', 'calls:edit']);
    assert.equal((await h.call('POST', '/admin/payouts', { perms: EDITOR, body: { astrologerId: 'x', amountPaise: 1 } })).body.needs, 'payouts:edit');
    assert.equal((await h.call('POST', '/admin/astrologers', { perms: VIEWER, body: {} })).body.needs, 'astrologers:edit');
    assert.equal((await h.call('GET', '/admin/calls', { tok: token({ perms: undefined, sub: null }) })).status, 401);
  });

  test('the role comes from THIS service\'s database, never from the token: a token that says `astrologer` for a stranger is refused', async () => {
    const r = await h.call('GET', '/astrologer/me', { tok: token({ iss: 'mobile-bff', sub: 'impostor', role: 'astrologer', perms: [], ctx: { role: 'astrologer', name: 'X' } }) });
    assert.deepEqual([r.status, r.body.code], [403, 'not_an_astrologer']);
    const a = await h.call('POST', `/calls/000000000000000000000001/accept`, { tok: token({ iss: 'mobile-bff', sub: 'impostor', role: 'astrologer', perms: [] }) });
    assert.equal(a.status, 403);
  });

  test('a devotee route with a token that has no subject is 401', async () => {
    const r = await h.call('POST', '/calls', { tok: token({ iss: 'mobile-bff', sub: null, perms: [] }), body: {} });
    assert.equal(r.status, 401);
  });
});

describe('contract shapes', () => {
  test('insufficient balance: 402 with needed / balance / shortfall, no call created', async () => {
    const uid = devotee(20);
    const r = await request(uid);
    assert.equal(r.status, 402);
    assert.equal(r.body.code, 'insufficient_coins');
    assert.deepEqual([r.body.needed, r.body.balance, r.body.shortfall], [30, 20, 10]);
    assert.equal(await CallSession.countDocuments({ devoteeUid: uid }), 0);
  });

  test('validation: a requestId is required (400), an unknown or unlisted astrologer is 409 astrologer_unavailable, you cannot call yourself', async () => {
    const uid = devotee(100);
    assert.deepEqual([(await h.call('POST', '/calls', { uid, body: { astrologerId: String(astro._id) } })).status, (await h.call('POST', '/calls', { uid, body: { astrologerId: String(astro._id) } })).body.code], [400, 'no_request_id']);
    const bad = await h.call('POST', '/calls', { uid, body: { astrologerId: 'nope', requestId: 'x1' } });
    assert.deepEqual([bad.status, bad.body.code], [409, 'astrologer_unavailable']);
    const me = await h.call('POST', '/calls', { uid: ASTRO_UID, body: { astrologerId: String(astro._id), requestId: 'self' } });
    assert.deepEqual([me.status, me.body.code], [400, 'self_call']);
  });

  test('an offline or stale astrologer cannot be called (409), and the body says why', async () => {
    const uid = devotee(100);
    await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'offline' } });
    const off = await request(uid);
    assert.deepEqual([off.status, off.body.code, off.body.presence], [409, 'astrologer_unavailable', 'offline']);
    await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', lastSeenAt: new Date(Date.now() - 120_000) } });
    const stale = await request(uid);
    assert.deepEqual([stale.status, stale.body.code], [409, 'astrologer_unavailable']);
    await goOnline();
  });

  test('the call view: exact keys, no credentials before the answer, the astrologer sees a first name only', async () => {
    const uid = devotee(100);
    const r = await request(uid);
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body), ['call']);
    const c = r.body.call;
    assert.deepEqual(Object.keys(c), ['id', 'status', 'endReason', 'astrologer', 'devotee', 'ratePerMin', 'minutesBilled', 'coinsCharged', 'coinsRefunded', 'rated', 'secondsToNextCharge', 'lowBalance', 'requestedAt', 'answeredAt', 'endedAt', 'balance']);
    assert.deepEqual([c.status, c.endReason, c.astrologer, c.devotee, c.ratePerMin, c.balance], ['requested', null, { id: String(astro._id), name: 'Pt. Sharma', photoUrl: '' }, { name: 'Asha' }, 10, 100]);
    assert.equal(c.rtc, undefined);
    const inc = await h.call('GET', '/astrologer/me/incoming', { uid: ASTRO_UID });
    assert.equal(inc.body.call.id, c.id);
    assert.equal(inc.body.call.devotee.name, 'Asha');
    assert.ok(!/Kumar|balance/.test(JSON.stringify(inc.body)), 'the astrologer sees neither the surname nor the devotee\'s balance');
    await h.call('POST', `/calls/${c.id}/cancel`, { uid });
  });

  test('a retry of the same requestId returns the same call (201 both times); another request while one is live is 409 already_in_call', async () => {
    const uid = devotee(100);
    const a = await request(uid, { requestId: 'same-1' });
    const b = await request(uid, { requestId: 'same-1' });
    assert.deepEqual([a.status, b.status, a.body.call.id === b.body.call.id], [201, 201, true]);
    const c = await request(uid, { requestId: 'other-1' });
    assert.deepEqual([c.status, c.body.code], [409, 'already_in_call']);
    await h.call('POST', `/calls/${a.body.call.id}/cancel`, { uid });
  });

  test('a stranger gets a 404 for someone else\'s call (no probing), a non-id is 404 too', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    const rando = devotee(0);
    assert.equal((await h.call('GET', `/calls/${id}`, { uid: rando })).status, 404);
    assert.equal((await h.call('GET', `/calls/not-an-id`, { uid })).status, 404);
    assert.equal((await accept(id, rando)).status, 403, 'a stranger who is not an astrologer: 403 from the astrologer gate');
    assert.equal((await h.call('POST', `/calls/${id}/cancel`, { uid: ASTRO_UID })).status, 403, 'the astrologer cannot cancel the devotee\'s call');
    await h.call('POST', `/calls/${id}/cancel`, { uid });
  });
});

describe('the flow, the minutes and the clock', () => {
  test('request charges nothing, accept takes minute 1, the ticker bills minutes, the low-balance flag, auto end out_of_coins', async () => {
    const uid = devotee(35);
    const r = await request(uid);
    const id = r.body.call.id;
    assert.equal(h.wallet.balance(uid), 35, 'ringing costs nothing');
    const a = await accept(id);
    assert.equal(a.status, 200);
    assert.equal(a.body.call.status, 'connected');
    assert.equal(a.body.call.minutesBilled, 1);
    assert.equal(a.body.call.rtc.provider, 'mock');
    assert.equal(h.wallet.balance(uid), 25, 'minute 1 charged on accept');
    assert.equal((await Astrologer.findById(astro._id)).presence, 'busy');
    assert.equal((await AstrologerEarning.find({ callId: id })).length, 1);
    assert.equal(h.wallet.txns.get(`call:${id}:min:1`).type, 'call_debit');

    const dv = await h.call('GET', `/calls/${id}`, { uid });
    assert.equal(dv.body.call.balance, 25);
    assert.deepEqual([dv.body.call.rtc.uid, dv.body.call.rtc.channel], [1, `call-${id}`]);
    const av = await h.call('GET', `/calls/${id}`, { uid: ASTRO_UID });
    assert.equal(av.body.call.rtc.uid, 2);
    assert.equal(av.body.call.balance, undefined, 'the astrologer is not shown the devotee\'s balance');
    assert.equal((await request(devotee(100))).status, 409, 'busy astrologer is unavailable');

    const answered = (await CallSession.findById(id)).answeredAt.getTime();
    const T = (s) => new Date(answered + s * 1000);
    await tick(T(30), QUIET);
    assert.equal((await CallSession.findById(id)).minutesBilled, 1, 'mid-minute: nothing new');
    await tick(T(61), QUIET);
    await tick(T(61), QUIET); // running the tick twice must never double charge
    assert.equal((await CallSession.findById(id)).minutesBilled, 2);
    assert.equal(h.wallet.balance(uid), 15);
    const view = async (s) => (await h.call('GET', `/calls/${id}`, { uid })).body.call; // the live view uses real time; use the service for a fake one
    void view;
    await tick(T(121), QUIET);
    assert.equal(h.wallet.balance(uid), 5);
    await tick(T(181), QUIET);
    const end = await CallSession.findById(id);
    assert.deepEqual([end.status, end.endReason, end.minutesBilled, end.coinsCharged], ['ended', 'out_of_coins', 3, 30]);
    assert.equal(end.endedAt.getTime(), answered + 180_000, 'ends at the moment the unaffordable minute began');
    assert.equal(h.wallet.balance(uid), 5, 'never negative, nothing taken for the unaffordable minute');
    assert.equal((await Astrologer.findById(astro._id)).presence, 'online', 'astrologer is free again');
    const earn = await AstrologerEarning.find({ callId: id }).sort({ minute: 1 });
    assert.deepEqual(earn.map((e) => [e.minute, e.coins, e.paise]), [[1, 7, 700], [2, 7, 700], [3, 7, 700]]);
    assert.equal(debits(uid).length, 3);
    await goOnline();
  });

  test('the view\'s secondsToNextCharge and lowBalance follow the clock (fake `now` through the service)', async () => {
    const { callService } = await import('./modules/calls/index.js');
    const uid = devotee(35);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    const c = await CallSession.findById(id);
    const T = (s) => new Date(c.answeredAt.getTime() + s * 1000);
    await tick(T(61), QUIET);
    await tick(T(121), QUIET);
    const v1 = await callService.toView(await CallSession.findById(id), { viewerUid: uid, now: T(121) });
    assert.deepEqual([v1.lowBalance, v1.secondsToNextCharge, v1.balance], [true, 59, 5], '5 coins cannot pay another minute');
    await callService.adminEnd(id);
    await goOnline();
  });

  test('declined, missed and cancelled calls charge nothing, and the devotee is free to call again', async () => {
    const d1 = devotee(100);
    const c1 = (await request(d1)).body.call.id;
    assert.equal((await h.call('POST', `/calls/${c1}/decline`, { uid: ASTRO_UID })).body.call.endReason, 'declined');
    const d2 = devotee(100);
    const c2 = (await request(d2)).body.call.id;
    assert.equal((await h.call('POST', `/calls/${c2}/cancel`, { uid: d2 })).body.call.endReason, 'cancelled');
    assert.equal((await accept(c2)).status, 409, 'cannot answer a cancelled call');
    const d3 = devotee(100);
    const c3 = (await request(d3)).body.call;
    const out = await tick(new Date(Date.parse(c3.requestedAt) + 26_000), QUIET);
    assert.equal(out.missed, 1);
    assert.equal((await CallSession.findById(c3.id)).endReason, 'missed');
    assert.equal((await accept(c3.id)).status, 409);
    for (const uid of [d1, d2, d3]) {
      assert.equal(h.wallet.balance(uid), 100);
      assert.equal(debits(uid).length, 0);
    }
    assert.equal(await AstrologerEarning.countDocuments({ callId: { $in: [c1, c2, c3.id] } }), 0);
    assert.equal((await request(d1)).status, 201);
    await CallSession.updateMany({ status: 'requested' }, { $set: { status: 'ended', endReason: 'cancelled' }, $unset: { devoteeLive: 1 } });
  });

  test('the ring window: an answer after the ring timeout is refused (409) and the call is missed by the next tick; not before', async () => {
    const uid = devotee(100);
    const c = (await request(uid)).body.call;
    const at = Date.parse(c.requestedAt);
    assert.equal((await tick(new Date(at + 24_000), QUIET)).missed, 0, 'still ringing at 24 s');
    assert.equal((await CallSession.findById(c.id)).status, 'requested');
    const { callService } = await import('./modules/calls/index.js');
    await assert.rejects(callService.acceptCall(await CallSession.findById(c.id), new Date(at + 26_000)), (e) => e.status === 409 && e.code === 'call_ended');
    assert.equal((await tick(new Date(at + 26_000), QUIET)).missed, 1);
    assert.equal((await CallSession.findById(c.id)).endReason, 'missed');
  });

  test('the ring timeout is read from the settings (lenient): a different value moves the window; settings down keeps the last known value', async () => {
    h.settings.values.ringTimeoutSec = '60';
    h.ctx.settings._reset?.();
    const uid = devotee(100);
    const c = (await request(uid)).body.call;
    const at = Date.parse(c.requestedAt);
    assert.equal((await tick(new Date(at + 40_000), QUIET)).missed, 0);
    h.settings.down = true; // lenient: never throws, falls back to the documented default (25 s) in the fake as in the real reader with nothing cached
    assert.equal((await tick(new Date(at + 40_000), QUIET)).missed, 1);
    h.settings.down = false;
    h.settings.values.ringTimeoutSec = '25';
  });

  test('concurrent accept/accept charges minute 1 once; concurrent end/end is idempotent', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    const [a, b] = await Promise.all([accept(id), accept(id)]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    assert.equal(debits(uid).length, 1);
    assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 1);
    assert.equal(h.wallet.balance(uid), 90);
    const [e1, e2] = await Promise.all([h.call('POST', `/calls/${id}/end`, { uid }), h.call('POST', `/calls/${id}/end`, { uid: ASTRO_UID })]);
    assert.deepEqual([e1.status, e2.status], [200, 200]);
    assert.equal((await CallSession.findById(id)).endReason, 'completed');
    assert.equal(h.wallet.balance(uid), 90, 'ending mid-minute keeps that minute, adds nothing');
    assert.equal((await Astrologer.findById(astro._id)).presence, 'online');
  });

  test('billing a stale copy of the same minute three times at once cannot double charge or double earn', async () => {
    const { callService } = await import('./modules/calls/index.js');
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    const stale = await CallSession.findById(id);
    await Promise.all([callService.billNextMinute(stale), callService.billNextMinute(stale), callService.billNextMinute(stale)]);
    const after = await CallSession.findById(id);
    assert.equal(after.minutesBilled, 2);
    assert.equal(h.wallet.balance(uid), 80);
    assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 2);
    assert.equal(debits(uid).length, 2);
    await callService.adminEnd(id);
  });

  test('only an active astrologer may answer, and only their own calls', async () => {
    const { callService } = await import('./modules/calls/index.js');
    const other = await Astrologer.create({ name: 'Other', ratePerMin: 5, signInEmail: 'other@example.com', uid: 'other-astro', status: 'active', listed: true });
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    const r = await accept(id, 'other-astro');
    assert.deepEqual([r.status, r.body.code], [404, 'call_not_found'], 'not a participant: a 404, not a hint');
    assert.equal((await h.call('POST', `/calls/${id}/decline`, { uid: 'other-astro' })).status, 404);
    await callService.adminEnd(id);
    await Astrologer.deleteOne({ _id: other._id });
  });

  test('a call whose parties keep polling is not ended by silence', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    await h.call('GET', `/calls/${id}`, { uid });
    await h.call('GET', `/calls/${id}`, { uid: ASTRO_UID });
    await tick(new Date(Date.now() + 5_000), { silenceMs: 90_000 });
    assert.equal((await CallSession.findById(id)).status, 'connected');
    const { callService } = await import('./modules/calls/index.js');
    await callService.adminEnd(id);
  });

  test('silence: a party that never pinged ends the call `failed` and the first minute is refunded WITH ofKey; earnings voided', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    const answered = (await CallSession.findById(id)).answeredAt.getTime();
    await tick(new Date(answered + 100_000), { silenceMs: 90_000 });
    const c = await CallSession.findById(id);
    assert.deepEqual([c.endReason, c.coinsRefunded], ['failed', 10]);
    assert.equal(h.wallet.balance(uid), 100);
    assert.equal(await AstrologerEarning.countDocuments({ callId: id, voidedAt: { $exists: false } }), 0);
    assert.equal(await AstrologerEarning.countDocuments({ callId: id, voidedAt: { $exists: true } }), 1, 'voided, not deleted: the books show what happened');
    const refund = h.wallet.hits.find((x) => x.path === '/refund' && x.body.key === `call:${id}:refund:1`);
    assert.equal(refund.body.ofKey, `call:${id}:min:1`);
    assert.equal(refund.iss, 'calls');
    assert.equal(refund.body.reason, undefined, 'no exemption is used');
  });

  test('silence after the call really ran: ends `completed`, nothing refunded; measured from the later of the last ping and the process start', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    await h.call('GET', `/calls/${id}`, { uid });
    await h.call('GET', `/calls/${id}`, { uid: ASTRO_UID });
    const seen = (await CallSession.findById(id)).devoteeSeenAt.getTime();
    // an instance that started 10 s ago must not end a call over a gap that began before it started
    await tick(new Date(seen + 200_000), { silenceMs: 90_000, since: seen + 190_000 });
    assert.equal((await CallSession.findById(id)).status, 'connected');
    await tick(new Date(seen + 200_000), { silenceMs: 90_000, since: 0 });
    const c = await CallSession.findById(id);
    assert.deepEqual([c.endReason, c.coinsRefunded], ['completed', 0]);
    assert.equal(h.wallet.balance(uid), 100 - 10 * c.minutesBilled, 'what the first pass billed (the minutes that had fallen due) stands; nothing was refunded');
  });

  test('suspending an astrologer mid-call ends it (admin) without un-charging the minute taken; the role is written back to identity', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    h.identity.roleWrites.length = 0;
    const s = await h.call('POST', `/admin/astrologers/${astro._id}/suspend`);
    assert.equal(s.status, 200);
    assert.equal(s.body.astrologer.status, 'suspended');
    const c = await CallSession.findById(id);
    assert.deepEqual([c.endReason, c.minutesBilled], ['admin', 1]);
    assert.equal(h.wallet.balance(uid), 90);
    assert.equal((await Astrologer.findById(astro._id)).presence, 'offline');
    assert.equal((await request(devotee(100))).body.code, 'astrologer_unavailable', 'suspended: new calls refused');
    assert.equal((await h.call('GET', '/astrologer/me', { uid: ASTRO_UID })).status, 403);
    assert.deepEqual(h.identity.roleWrites, [{ uid: ASTRO_UID, role: 'devotee' }]);
    await h.call('POST', `/admin/astrologers/${astro._id}/reactivate`);
    assert.deepEqual(h.identity.roleWrites.at(-1), { uid: ASTRO_UID, role: 'astrologer' });
    await goOnline();
  });

  test('rating: once, only after connecting; the average appears only when real', async () => {
    const before = await h.call('GET', '/astrologers', { uid: 'x' });
    assert.equal(before.body.astrologers[0].ratingAvg, undefined);
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    assert.equal((await h.call('POST', `/calls/${id}/rating`, { uid, body: { rating: 5 } })).status, 409, 'not ended yet');
    await accept(id);
    await h.call('POST', `/calls/${id}/end`, { uid });
    assert.equal((await h.call('POST', `/calls/${id}/rating`, { uid, body: { rating: 9 } })).status, 400);
    assert.equal((await h.call('POST', `/calls/${id}/rating`, { uid: ASTRO_UID, body: { rating: 5 } })).status, 403, 'only the caller can rate');
    const ok = await h.call('POST', `/calls/${id}/rating`, { uid, body: { rating: 4 } });
    assert.deepEqual([ok.status, ok.body.call.rated], [200, true]);
    assert.equal((await h.call('POST', `/calls/${id}/rating`, { uid, body: { rating: 5 } })).body.code, 'already_rated');
    const list = await h.call('GET', '/astrologers', { uid: 'x' });
    assert.deepEqual([list.body.astrologers[0].ratingAvg, list.body.astrologers[0].ratingCount], [4, 1]);
    assert.ok(!/signIn|sharma@example/.test(JSON.stringify(list.body)), 'sign-in identifiers never leak publicly');
  });
});

describe('the operator side', () => {
  test('admin list shows live calls with the devotee name masked for a role without devotees:view; force end works', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    const full = await h.call('GET', '/admin/calls?limit=5');
    assert.ok(full.body.live.some((c) => c.id === id && c.devoteeName === 'Asha Kumar'));
    const masked = await h.call('GET', '/admin/calls?limit=5', { perms: ['calls:view'] });
    const row = masked.body.live.find((c) => c.id === id);
    assert.match(row.devoteeName, /^Devotee ••\d{4}$/);
    assert.deepEqual(Object.keys(full.body.live.find((c) => c.id === id)), ['id', 'startedAt', 'devoteeName', 'astrologerName', 'durationSec', 'coins', 'minutesBilled', 'status', 'endReason', 'rating']);
    const e = await h.call('POST', `/admin/calls/${id}/end`);
    assert.equal(e.body.call.endReason, 'admin');
    assert.equal((await h.call('POST', `/admin/calls/000000000000000000000009/end`)).body.code, 'call_not_found');
    const filtered = await h.call('GET', '/admin/calls?outcome=admin');
    assert.ok(filtered.body.calls.every((c) => c.endReason === 'admin'));
  });

  test('the kill switch: callsEnabled=false refuses new calls with 503 calls_disabled', async () => {
    h.settings.values.callsEnabled = 'false';
    const r = await request(devotee(100));
    assert.deepEqual([r.status, r.body.code], [503, 'calls_disabled']);
    h.settings.values.callsEnabled = 'true';
  });
});

describe('goodwill refunds carry ofKey', () => {
  async function endedCall(minutes, coins = 100) {
    const { callService } = await import('./modules/calls/index.js');
    const uid = devotee(coins);
    const id = (await request(uid)).body.call.id;
    await accept(id);
    const c = await CallSession.findById(id);
    for (let m = 2; m <= minutes; m++) await tick(new Date(c.answeredAt.getTime() + (m - 1) * 60_000 + 1000), QUIET);
    await callService.adminEnd(id);
    await goOnline();
    return { uid, id };
  }
  const refundHits = (id) => h.wallet.hits.filter((x) => x.path === '/refund' && x.body.key.startsWith(`call:${id}:gw:`));

  test('bounded by what was charged, idempotent per requestId; every part names the minute it reverses', async () => {
    const { uid, id } = await endedCall(1);
    const bad = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 11, reason: 'x' } });
    assert.deepEqual([bad.status, bad.body.code, bad.body.charged, bad.body.refunded], [400, 'refund_exceeds_charge', 10, 0]);
    const a = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 4, reason: 'echo', requestId: 'g1' } });
    const b = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 4, reason: 'echo', requestId: 'g1' } });
    assert.deepEqual([a.status, a.body.ok, a.body.balance, b.body.balance], [200, true, 94, 94]);
    assert.equal((await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 7, reason: 'more', requestId: 'g2' } })).status, 400);
    const call = await CallSession.findById(id);
    assert.equal(call.coinsRefunded, 4);
    assert.deepEqual(call.refunds[0].parts.map((p) => [p.minute, p.coins]), [[1, 4]]);
    const hits = refundHits(id);
    assert.equal(hits.length, 1, 'the duplicate request reached the wallet zero times');
    assert.deepEqual([hits[0].body.key, hits[0].body.ofKey, hits[0].body.amount, hits[0].body.reason, hits[0].iss], [`call:${id}:gw:g1:1`, `call:${id}:min:1`, 4, undefined, 'calls']);
    assert.equal(h.wallet.balance(uid), 94);
  });

  test('a refund larger than one minute is split over the minutes, each under its own key and ofKey; the response is the final balance', async () => {
    const { uid, id } = await endedCall(3, 100); // 3 minutes x 10 = 30 charged
    const r = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 25, reason: 'dropped line', requestId: 'big' } });
    assert.deepEqual([r.status, r.body.balance], [200, 70 + 25]);
    const hits = refundHits(id);
    assert.deepEqual(hits.map((x) => [x.body.ofKey.split(':').pop(), x.body.amount]), [['1', 10], ['2', 10], ['3', 5]]);
    assert.equal((await CallSession.findById(id)).coinsRefunded, 25);
    // 5 more coins fit under the charge but minute 3 is partly refunded and minutes 1-2 fully: the wallet refunds a debit once, so it is refused honestly
    const more = await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 5, reason: 'again', requestId: 'big2' } });
    assert.deepEqual([more.status, more.body.code], [409, 'refund_minutes_used']);
    assert.equal((await CallSession.findById(id)).coinsRefunded, 25, 'nothing was reserved');
    assert.equal(h.wallet.balance(uid), 95);
  });

  test('two operators at once cannot both take the same minutes (the reservation claims them in one write)', async () => {
    const { uid, id } = await endedCall(2, 100); // 20 charged
    const rs = await Promise.all([1, 2, 3].map((i) => h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 15, reason: `op${i}`, requestId: `race-${i}` } })));
    assert.equal(rs.filter((r) => r.status === 200).length, 1, `one fits: ${rs.map((r) => r.status)}`);
    assert.equal((await CallSession.findById(id)).coinsRefunded, 15);
    assert.equal(h.wallet.balance(uid), 80 + 15);
    for (const r of rs.filter((x) => x.status !== 200)) assert.ok(['refund_exceeds_charge', 'refund_minutes_used', 'refund_busy'].includes(r.body.code), r.body.code);
  });

  test('a goodwill refund validates its input (whole coins, a reason) and the call (404)', async () => {
    const { id } = await endedCall(1);
    assert.equal((await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 1.5, reason: 'x' } })).body.code, 'bad_amount');
    assert.equal((await h.call('POST', `/admin/calls/${id}/refund`, { body: { coins: 1, reason: '  ' } })).body.code, 'reason_required');
    assert.equal((await h.call('POST', `/admin/calls/000000000000000000000009/refund`, { body: { coins: 1, reason: 'x' } })).body.code, 'call_not_found');
    assert.equal((await h.call('POST', `/admin/calls/not-an-id/refund`, { body: { coins: 1, reason: 'x' } })).status, 404);
  });

  test('a call that charged nothing has nothing to refund: the exemption is never needed (and never used)', async () => {
    const uid = devotee(100);
    const c = (await request(uid)).body.call;
    await h.call('POST', `/calls/${c.id}/cancel`, { uid });
    const r = await h.call('POST', `/admin/calls/${c.id}/refund`, { body: { coins: 1, reason: 'x' } });
    assert.deepEqual([r.status, r.body.code], [400, 'refund_exceeds_charge']);
    assert.equal(h.wallet.hits.filter((x) => x.path === '/refund' && x.body.reason !== undefined).length, 0);
  });
});

describe('real-time audio provider', () => {
  test('selection: mock outside production, mock REFUSED in production, agora needs both values', async () => {
    assert.equal(resolveRtcProvider({}).name, 'mock');
    assert.throws(() => resolveRtcProvider({ NODE_ENV: 'production' }), (e) => e.status === 503 && e.code === 'calls_unavailable');
    assert.throws(() => resolveRtcProvider({ NODE_ENV: 'production', RTC_PROVIDER: 'mock' }), (e) => e.code === 'calls_unavailable' && /refused in production/.test(e.message));
    assert.throws(() => resolveRtcProvider({ RTC_PROVIDER: 'agora' }), (e) => e.code === 'calls_unavailable');
    assert.throws(() => resolveRtcProvider({ RTC_PROVIDER: 'agora', AGORA_APP_ID: 'x'.repeat(32) }), (e) => e.code === 'calls_unavailable');
    assert.throws(() => resolveRtcProvider({ RTC_PROVIDER: 'carrier-pigeon' }), (e) => e.code === 'calls_unavailable');
    assert.equal(resolveRtcProvider({ AGORA_APP_ID: 'a'.repeat(32), AGORA_APP_CERTIFICATE: 'b'.repeat(32) }).name, 'agora', 'unset RTC_PROVIDER + both values = agora');
  });

  test('agora issues a real 007 token for the channel and uid, with DUMMY credentials (no network)', async () => {
    const env = { NODE_ENV: 'production', AGORA_APP_ID: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', AGORA_APP_CERTIFICATE: '0f1e2d3c4b5a69788796a5b4c3d2e1f0' };
    const p = resolveRtcProvider(env);
    const dev = await p.issue({ channel: 'call-abc', uid: 1 });
    const ast = await p.issue({ channel: 'call-abc', uid: 2 });
    assert.deepEqual([dev.provider, dev.appId, dev.channel, dev.uid, ast.uid], ['agora', env.AGORA_APP_ID, 'call-abc', 1, 2]);
    assert.match(dev.token, /^007/);
    assert.notEqual(dev.token, ast.token);
  });

  test('misconfigured: a new call is refused with 503 calls_unavailable BEFORE anything is promised; production + mock is refused too', async () => {
    const uid = devotee(100);
    for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', RTC_PROVIDER: 'mock' }, { RTC_PROVIDER: 'agora' }]) {
      h.ctx.rtc = () => resolveRtcProvider(env);
      const r = await request(uid);
      assert.deepEqual([r.status, r.body.code], [503, 'calls_unavailable'], JSON.stringify(env));
      assert.equal(await CallSession.countDocuments({ devoteeUid: uid }), 0);
    }
    h.ctx.rtc = null;
  });

  test('with agora configured the connected view carries an agora token for each party (uid 1 / 2) on the call channel', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    h.ctx.rtc = () => resolveRtcProvider({ AGORA_APP_ID: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', AGORA_APP_CERTIFICATE: '0f1e2d3c4b5a69788796a5b4c3d2e1f0' });
    const a = await accept(id);
    assert.equal(a.body.call.rtc.provider, 'agora');
    const dv = await h.call('GET', `/calls/${id}`, { uid });
    const av = await h.call('GET', `/calls/${id}`, { uid: ASTRO_UID });
    assert.deepEqual([dv.body.call.rtc.uid, av.body.call.rtc.uid, dv.body.call.rtc.channel], [1, 2, `call-${id}`]);
    assert.match(dv.body.call.rtc.token, /^007/);
    h.ctx.rtc = null;
    const { callService } = await import('./modules/calls/index.js');
    await callService.adminEnd(id);
    await goOnline();
  });

  test('accept with credentials that cannot be issued: the charge is given back (the call ends `failed`, refunded with ofKey)', async () => {
    const uid = devotee(100);
    const id = (await request(uid)).body.call.id;
    let calls = 0;
    h.ctx.rtc = () => { if (++calls === 1) return resolveRtcProvider({}); throw Object.assign(new Error('x'), { status: 503, code: 'calls_unavailable' }); };
    // getRtcProvider() is called first thing in acceptCall; make THAT succeed and issue() fail
    h.ctx.rtc = () => ({ name: 'broken', issue: async () => { throw new Error('vendor down'); } });
    const r = await accept(id);
    assert.deepEqual([r.status, r.body.code], [503, 'calls_unavailable']);
    const c = await CallSession.findById(id);
    assert.deepEqual([c.status, c.endReason, c.coinsRefunded], ['ended', 'failed', 10]);
    assert.equal(h.wallet.balance(uid), 100);
    h.ctx.rtc = null;
    await goOnline();
  });
});
