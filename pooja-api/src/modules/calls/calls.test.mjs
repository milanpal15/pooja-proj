import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Setting, User } from '../../models.js';
import { Astrologer } from '../astrologers/astrologer.model.js';
import * as astrologers from '../astrologers/index.js';
import { AstrologerEarning } from '../payouts/payout.model.js';
import * as payouts from '../payouts/index.js';
import * as walletMod from '../wallet/index.js';
import * as wallet from '../wallet/wallet.service.js';
import { WalletTxn } from '../wallet/wallet.model.js';
import { startApp } from '../_harness.mjs';
import { tick } from './billing.ticker.js';
import { CallSession } from './call.model.js';
import * as callService from './call.service.js';
import * as callsMod from './index.js';
import { getRtcProvider } from './rtc.provider.js';

let app;
let api;
let astro; // active, online astrologer, 10 coins/min, 30% share
const ASTRO_UID = 'astro-uid';

const fund = (uid, amount) => wallet.credit({ uid, amount, type: 'bonus', idempotencyKey: `fund:${uid}:${Math.random()}` });
const goOnline = () => Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', lastSeenAt: new Date(), status: 'active', listed: true } });
const request = (uid, requestId = `r-${Math.random()}`) => api('POST', '/calls', { uid, body: { astrologerId: String(astro._id), requestId } });
const accept = (id, uid = ASTRO_UID) => api('POST', `/calls/${id}/accept`, { uid });
const txns = (uid) => WalletTxn.find({ uid, type: 'call_debit', status: 'posted' }).lean();
let n = 0;
const devotee = async (coins, name = 'Asha Kumar') => {
  const uid = `dev-${++n}`;
  await User.create({ uid, contact: `+9199000${String(n).padStart(5, '0')}`, name, email: `${uid}@private.example`, phone: `+9199000${n}` });
  if (coins) await fund(uid, coins);
  return uid;
};

before(async () => {
  app = await startApp('calls_test_flow', [walletMod, astrologers, callsMod, payouts]);
  api = app.api;
  await callsMod.seed();
  astro = await Astrologer.create({
    name: 'Pt. Sharma', ratePerMin: 10, platformSharePct: 30, signInEmail: 'sharma@example.com',
    uid: ASTRO_UID, status: 'active', listed: true, presence: 'online', lastSeenAt: new Date(),
  });
  await User.create({ uid: ASTRO_UID, contact: 'sharma@example.com', name: 'Pt. Sharma', role: 'astrologer' });
});
after(async () => app.close());

test('seeds the five settings with contract defaults, idempotently', async () => {
  await callsMod.seed();
  const rows = Object.fromEntries((await Setting.find().lean()).map((s) => [s.key, s.value]));
  assert.deepEqual(
    ['minMinutes', 'ringTimeoutSec', 'defaultSharePct', 'payoutPaisePerCoin', 'callsEnabled'].map((k) => rows[k]),
    ['3', '25', '30', '100', 'true'],
  );
  assert.equal(await Astrologer.countDocuments(), 1, 'no astrologers are ever seeded');
});

test('insufficient balance: 402 with needed/balance/shortfall, no call created', async () => {
  const uid = await devotee(20);
  const r = await request(uid);
  assert.equal(r.status, 402);
  assert.equal(r.body.code, 'insufficient_coins');
  assert.deepEqual([r.body.needed, r.body.balance, r.body.shortfall], [30, 20, 10]);
  assert.equal(await CallSession.countDocuments({ devoteeUid: uid }), 0);
});

test('an offline or stale astrologer cannot be called (409)', async () => {
  const uid = await devotee(100);
  await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'offline' } });
  assert.equal((await request(uid)).status, 409);
  // "online" but the heartbeat went quiet 2 minutes ago
  await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', lastSeenAt: new Date(Date.now() - 120_000) } });
  const r = await request(uid);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'astrologer_unavailable');
  await goOnline();
});

test('full flow: request charges nothing, accept takes minute 1, ticker bills minutes, low-balance flag, auto end out_of_coins', async () => {
  const uid = await devotee(35);
  const r = await request(uid);
  assert.equal(r.status, 201);
  const id = r.body.call.id;
  assert.equal(r.body.call.status, 'requested');
  assert.equal(await wallet.getBalance(uid), 35, 'ringing costs nothing');
  assert.equal(r.body.call.rtc, undefined, 'no credentials before the answer');

  // The astrologer sees a first name only — never phone/email.
  const inc = await api('GET', '/astrologer/me/incoming', { uid: ASTRO_UID });
  assert.equal(inc.body.call.id, id);
  assert.equal(inc.body.call.devotee.name, 'Asha');
  const text = JSON.stringify(inc.body);
  assert.ok(!/private\.example|\+9199|Kumar/.test(text), 'astrologer must not see surname/phone/email');

  // A second devotee cannot also have this devotee's slot; the same devotee cannot call twice.
  assert.equal((await request(uid)).body.code, 'already_in_call');

  const a = await accept(id);
  assert.equal(a.status, 200);
  assert.equal(a.body.call.status, 'connected');
  assert.equal(a.body.call.minutesBilled, 1);
  assert.equal(a.body.call.rtc.provider, 'mock');
  assert.equal(await wallet.getBalance(uid), 25, 'minute 1 charged on accept');
  assert.equal((await Astrologer.findById(astro._id)).presence, 'busy');
  assert.equal((await AstrologerEarning.find({ callId: id })).length, 1);

  // devotee view: balance + rtc; astrologer cannot call into a busy line
  const dv = await api('GET', `/calls/${id}`, { uid });
  assert.equal(dv.body.call.balance, 25);
  assert.ok(dv.body.call.rtc);
  const other = await devotee(100);
  assert.equal((await request(other)).status, 409, 'busy astrologer is unavailable');

  const answered = (await CallSession.findById(id)).answeredAt.getTime();
  const T = (s) => new Date(answered + s * 1000);
  const quiet = { silenceMs: Infinity };

  await tick(T(30), quiet);
  assert.equal((await CallSession.findById(id)).minutesBilled, 1, 'mid-minute: nothing new');

  await tick(T(61), quiet);
  await tick(T(61), quiet); // running the tick twice must never double charge
  assert.equal((await CallSession.findById(id)).minutesBilled, 2);
  assert.equal(await wallet.getBalance(uid), 15);
  let view = await callService.toView(await CallSession.findById(id), { viewerUid: uid, now: T(61) });
  assert.equal(view.lowBalance, false, '15 coins = a minute and then another');

  await tick(T(121), quiet);
  assert.equal(await wallet.getBalance(uid), 5);
  view = await callService.toView(await CallSession.findById(id), { viewerUid: uid, now: T(121) });
  assert.equal(view.lowBalance, true, '5 coins cannot pay another minute');
  assert.equal(view.secondsToNextCharge, 59);

  await tick(T(181), quiet);
  const end = await CallSession.findById(id);
  assert.equal(end.status, 'ended');
  assert.equal(end.endReason, 'out_of_coins');
  assert.equal(end.minutesBilled, 3);
  assert.equal(end.coinsCharged, 30);
  assert.equal(end.endedAt.getTime(), answered + 180_000, 'ends at the moment the unaffordable minute began');
  assert.equal(await wallet.getBalance(uid), 5, 'never negative, nothing taken for the unaffordable minute');
  assert.equal((await Astrologer.findById(astro._id)).presence, 'online', 'astrologer is free again');

  const earn = await AstrologerEarning.find({ callId: id }).sort({ minute: 1 });
  assert.deepEqual(earn.map((e) => [e.minute, e.coins, e.paise]), [[1, 7, 700], [2, 7, 700], [3, 7, 700]]);
  assert.equal((await txns(uid)).length, 3);
  assert.equal((await wallet.verifyWallet(uid)).ok, true);
  await goOnline();
});

test('declined, missed and cancelled calls charge nothing', async () => {
  const d1 = await devotee(100);
  const c1 = (await request(d1)).body.call.id;
  const dec = await api('POST', `/calls/${c1}/decline`, { uid: ASTRO_UID });
  assert.equal(dec.body.call.endReason, 'declined');

  const d2 = await devotee(100);
  const c2 = (await request(d2)).body.call.id;
  const canc = await api('POST', `/calls/${c2}/cancel`, { uid: d2 });
  assert.equal(canc.body.call.endReason, 'cancelled');
  assert.equal((await accept(c2)).status, 409, 'cannot answer a cancelled call');

  const d3 = await devotee(100);
  const c3 = (await request(d3)).body.call;
  const out = await tick(new Date(Date.parse(c3.requestedAt) + 26_000), { silenceMs: Infinity });
  assert.equal(out.missed, 1);
  assert.equal((await CallSession.findById(c3.id)).endReason, 'missed');
  assert.equal((await accept(c3.id)).status, 409);

  for (const uid of [d1, d2, d3]) {
    assert.equal(await wallet.getBalance(uid), 100);
    assert.equal((await txns(uid)).length, 0);
  }
  assert.equal(await AstrologerEarning.countDocuments({ callId: { $in: [c1, c2, c3.id] } }), 0);
  // and the devotee is free to call again
  assert.equal((await request(d1)).status, 201);
  await CallSession.updateMany({ status: 'requested' }, { $set: { status: 'ended', endReason: 'cancelled' }, $unset: { devoteeLive: 1 } });
});

test('concurrent accept/accept charges minute 1 once; concurrent end/end is idempotent', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  const [a, b] = await Promise.all([accept(id), accept(id)]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.equal((await txns(uid)).length, 1);
  assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 1);
  assert.equal(await wallet.getBalance(uid), 90);

  const [e1, e2] = await Promise.all([
    api('POST', `/calls/${id}/end`, { uid }),
    api('POST', `/calls/${id}/end`, { uid: ASTRO_UID }),
  ]);
  assert.deepEqual([e1.status, e2.status], [200, 200]);
  assert.equal((await CallSession.findById(id)).endReason, 'completed');
  assert.equal(await wallet.getBalance(uid), 90, 'ending mid-minute keeps that minute, adds nothing');
  assert.equal((await Astrologer.findById(astro._id)).presence, 'online');
});

test('billing a stale copy of the same minute cannot double charge', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  await accept(id);
  const stale = await CallSession.findById(id); // minutesBilled = 1
  await Promise.all([callService.billNextMinute(stale), callService.billNextMinute(stale), callService.billNextMinute(stale)]);
  const after = await CallSession.findById(id);
  assert.equal(after.minutesBilled, 2);
  assert.equal(await wallet.getBalance(uid), 80);
  assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 2);
  await callService.adminEnd(id);
});

test('only an active astrologer may answer, and only their own calls', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  const rando = await devotee(0);
  assert.equal((await accept(id, rando)).status, 403);
  assert.equal((await api('GET', `/calls/${id}`, { uid: rando })).status, 404, 'strangers get a 404, not a hint');
  assert.equal((await api('POST', `/calls/${id}/cancel`, { uid: ASTRO_UID })).status, 403);
  await callService.adminEnd(id);
});

test('connect failure: the first charge is refunded and earnings voided', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  await accept(id);
  const answered = (await CallSession.findById(id)).answeredAt.getTime();
  // Nobody ever polled the call; 100 s later the ticker finds it dead.
  await tick(new Date(answered + 100_000), { silenceMs: 90_000 });
  const c = await CallSession.findById(id);
  assert.equal(c.endReason, 'failed');
  assert.equal(await wallet.getBalance(uid), 100);
  assert.equal((await wallet.verifyWallet(uid)).ok, true);
  assert.equal(await AstrologerEarning.countDocuments({ callId: id, voidedAt: { $exists: false } }), 0);
  assert.equal((await WalletTxn.find({ uid, type: 'refund' })).length, 1);
});

test('a call whose parties keep polling is not ended by silence', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  await accept(id);
  await api('GET', `/calls/${id}`, { uid });
  await api('GET', `/calls/${id}`, { uid: ASTRO_UID });
  await tick(new Date(Date.now() + 5_000), { silenceMs: 90_000 });
  assert.equal((await CallSession.findById(id)).status, 'connected');
  await callService.adminEnd(id);
});

test('suspending an astrologer mid-call ends it (admin) without un-charging the minute taken', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  await accept(id);
  const s = await api('POST', `/admin/astrologers/${astro._id}/suspend`);
  assert.equal(s.status, 200);
  assert.equal(s.body.astrologer.status, 'suspended');
  const c = await CallSession.findById(id);
  assert.equal(c.endReason, 'admin');
  assert.equal(c.minutesBilled, 1);
  assert.equal(await wallet.getBalance(uid), 90);
  assert.equal((await Astrologer.findById(astro._id)).presence, 'offline');
  assert.equal((await request(await devotee(100))).body.code, 'astrologer_unavailable', 'suspended: new calls refused');
  assert.equal((await api('GET', '/astrologer/me', { uid: ASTRO_UID })).status, 403);
  assert.equal((await User.findOne({ uid: ASTRO_UID })).role, 'devotee');
  await api('POST', `/admin/astrologers/${astro._id}/reactivate`);
  assert.equal((await User.findOne({ uid: ASTRO_UID })).role, 'astrologer');
  await goOnline();
});

test('rating: once, only after connecting; the average appears only when real', async () => {
  const before = await api('GET', '/astrologers');
  assert.equal(before.body.astrologers[0].ratingAvg, undefined);
  assert.equal(before.body.astrologers[0].ratingCount, undefined);

  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  assert.equal((await api('POST', `/calls/${id}/rating`, { uid, body: { rating: 5 } })).status, 409, 'not ended yet');
  await accept(id);
  await api('POST', `/calls/${id}/end`, { uid });
  assert.equal((await api('POST', `/calls/${id}/rating`, { uid, body: { rating: 9 } })).status, 400);
  assert.equal((await api('POST', `/calls/${id}/rating`, { uid, body: { rating: 4 } })).status, 200);
  assert.equal((await api('POST', `/calls/${id}/rating`, { uid, body: { rating: 5 } })).body.code, 'already_rated');
  const list = await api('GET', '/astrologers');
  assert.equal(list.body.astrologers[0].ratingAvg, 4);
  assert.equal(list.body.astrologers[0].ratingCount, 1);
  assert.ok(!/signIn|sharma@example/.test(JSON.stringify(list.body)), 'sign-in identifiers never leak publicly');
});

test('goodwill refund: bounded by what was charged, idempotent per requestId', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  await accept(id);
  await callService.adminEnd(id);
  const bad = await api('POST', `/admin/calls/${id}/refund`, { body: { coins: 11, reason: 'x' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'refund_exceeds_charge');
  const a = await api('POST', `/admin/calls/${id}/refund`, { body: { coins: 4, reason: 'echo', requestId: 'g1' } });
  const b = await api('POST', `/admin/calls/${id}/refund`, { body: { coins: 4, reason: 'echo', requestId: 'g1' } });
  assert.equal(a.body.balance, 94);
  assert.equal(b.body.balance, 94);
  assert.equal((await api('POST', `/admin/calls/${id}/refund`, { body: { coins: 7, reason: 'more', requestId: 'g2' } })).status, 400);
  assert.equal((await CallSession.findById(id)).coinsRefunded, 4);
});

test('admin list shows live calls; force end works', async () => {
  const uid = await devotee(100);
  const id = (await request(uid)).body.call.id;
  await accept(id);
  const l = await api('GET', '/admin/calls?limit=5');
  assert.ok(l.body.live.some((c) => c.id === id));
  const e = await api('POST', `/admin/calls/${id}/end`);
  assert.equal(e.body.call.endReason, 'admin');
  const filtered = await api('GET', '/admin/calls?outcome=admin');
  assert.ok(filtered.body.calls.every((c) => c.endReason === 'admin'));
});

test('kill switch: callsEnabled=false refuses new calls with 503 calls_disabled', async () => {
  await Setting.updateOne({ key: 'callsEnabled' }, { $set: { value: 'false' } });
  const r = await request(await devotee(100));
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'calls_disabled');
  await Setting.updateOne({ key: 'callsEnabled' }, { $set: { value: 'true' } });
});

test('rtc provider selection: mock is refused in production; agora needs both values', async () => {
  assert.equal(getRtcProvider({}).name, 'mock');
  assert.throws(() => getRtcProvider({ NODE_ENV: 'production' }), (e) => e.status === 503 && e.code === 'calls_unavailable');
  assert.throws(() => getRtcProvider({ NODE_ENV: 'production', RTC_PROVIDER: 'mock' }), (e) => e.code === 'calls_unavailable');
  assert.throws(() => getRtcProvider({ RTC_PROVIDER: 'agora' }), (e) => e.code === 'calls_unavailable');
  const env = { AGORA_APP_ID: 'a'.repeat(32), AGORA_APP_CERTIFICATE: 'b'.repeat(32) };
  const p = getRtcProvider({ NODE_ENV: 'production', ...env });
  assert.equal(p.name, 'agora');
  const cred = await p.issue({ channel: 'call-1', uid: 1 });
  assert.equal(cred.provider, 'agora');
  assert.ok(cred.token.length > 40);
  assert.equal(cred.appId, env.AGORA_APP_ID);
});
