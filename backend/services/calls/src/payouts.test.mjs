// Earnings and payouts: per-minute earning rows (share snapshotted per call, rate in force when billed, voided minutes never count), payouts as
// bookkeeping rows (no coin moves), over-payment refused, two simultaneous payouts - even from two instances - cannot both fit.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27271/x node --test --test-concurrency=1 src/payouts.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import mongoose from 'mongoose';

import { Astrologer, AstrologerEarning, CallSession, Payout } from './models.js';
import { callService, tick } from './modules/calls/index.js';
import { LOCK_MS, istBoundaries, recordPayout } from './modules/payouts/payout.service.js';
import { EDITOR, boot } from './test-kit.mjs';

let h;
let a;
let b;
const earn = (astro, minute, paise, at = new Date(), extra = {}) =>
  AstrologerEarning.create({ astrologerId: astro._id, callId: extra.callId ?? new mongoose.Types.ObjectId(), minute, coins: paise / 100, paise, at, ...extra });
const QUIET = { silenceMs: Infinity };

before(async () => {
  h = await boot('calls_tests_payouts');
  a = await Astrologer.create({ name: 'A', ratePerMin: 10, signInEmail: 'a@x.co', uid: 'ua', status: 'active' });
  b = await Astrologer.create({ name: 'B', ratePerMin: 10, signInEmail: 'b@x.co' });
});
after(() => h.stop());

test('summary: earned, paid and due per astrologer; voided minutes do not count', async () => {
  const call = new mongoose.Types.ObjectId();
  await earn(a, 1, 700, new Date(), { callId: call });
  await earn(a, 2, 700, new Date(), { callId: call });
  await earn(a, 3, 700, new Date(), { callId: call, voidedAt: new Date() });
  const s = await h.call('GET', '/admin/payouts/summary');
  assert.deepEqual(Object.keys(s.body), ['astrologers']);
  const row = s.body.astrologers.find((x) => x.name === 'A');
  assert.deepEqual(row, { id: String(a._id), name: 'A', earnedPaise: 1400, paidPaise: 0, duePaise: 1400 });
  assert.equal(s.body.astrologers.find((x) => x.name === 'B').duePaise, 0);
});

test('recording a payout: reduces due, cannot exceed it, validates the amount; payouts move no coin', async () => {
  const hitsBefore = h.wallet.hits.length;
  const ok = await h.call('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 1000, reference: 'UTR123' } });
  assert.equal(ok.status, 201);
  assert.deepEqual(Object.keys(ok.body.payout), ['id', 'astrologerId', 'amountPaise', 'paidAt', 'reference']);
  const over = await h.call('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 401 } });
  assert.deepEqual([over.status, over.body.code, over.body.duePaise], [409, 'exceeds_due', 400]);
  const code = async (body) => (await h.call('POST', '/admin/payouts', { body })).body.code;
  assert.equal(await code({ amountPaise: 1 }), 'no_astrologer');
  assert.equal(await code({ astrologerId: String(a._id), amountPaise: 0 }), 'bad_amount');
  assert.equal(await code({ astrologerId: String(a._id), amountPaise: 1.5 }), 'bad_amount');
  assert.equal(await code({ astrologerId: 'nope', amountPaise: 1 }), 'astrologer_not_found');
  const s = await h.call('GET', '/admin/payouts/summary');
  assert.deepEqual(s.body.astrologers.find((x) => x.name === 'A'), { id: String(a._id), name: 'A', earnedPaise: 1400, paidPaise: 1000, duePaise: 400 });
  const list = await h.call('GET', `/admin/payouts?astrologerId=${a._id}`);
  assert.deepEqual(Object.keys(list.body.payouts[0]), ['id', 'astrologerId', 'astrologerName', 'amountPaise', 'paidAt', 'reference', 'recordedBy']);
  assert.deepEqual([list.body.payouts.length, list.body.payouts[0].reference, list.body.payouts[0].recordedBy, list.body.payouts[0].astrologerName], [1, 'UTR123', 'tester', 'A']);
  assert.deepEqual((await h.call('GET', '/admin/payouts?astrologerId=not-an-id')).body, { payouts: [] });
  assert.equal(h.wallet.hits.length, hitsBefore, 'the wallet was never asked: a payout is a bookkeeping row');
});

test('two simultaneous payouts cannot both fit under the same due amount', async () => {
  const rs = await Promise.all([1, 2, 3, 4].map(() => h.call('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 300 } })));
  assert.equal(rs.filter((r) => r.status === 201).length, 1, 'only 400 due: one 300 fits');
  assert.equal(await Payout.countDocuments({ astrologerId: a._id }), 2);
  assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.body.code === 'exceeds_due'));
});

test('the same holds across INSTANCES: the lease is on the row in the database, not in a process; an expired lease (a dead holder) is taken over', async () => {
  const c = await Astrologer.create({ name: 'C', ratePerMin: 10, signInEmail: 'c@x.co' });
  await earn(c, 1, 1000);
  // eight callers, as if from several instances (each goes straight to the service function, sharing nothing but the database)
  const rs = await Promise.allSettled(Array.from({ length: 8 }, () => recordPayout({ astrologerId: c._id, amountPaise: 400, recordedBy: 'x' })));
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 2, '1000 due: two 400s fit, no third');
  assert.equal(await Payout.countDocuments({ astrologerId: c._id }), 2);
  assert.equal((await Astrologer.findById(c._id).lean()).payoutLock, undefined, 'the lease is released');
  // a holder that died: a stale lease does not block forever
  await Astrologer.updateOne({ _id: c._id }, { $set: { payoutLock: { id: 'dead', until: new Date(Date.now() - 1) } } });
  assert.equal((await recordPayout({ astrologerId: c._id, amountPaise: 200, recordedBy: 'x' })).amountPaise, 200);
  // a live lease makes the second caller wait, then say so (409 payout_busy) rather than pay blind
  await Astrologer.updateOne({ _id: c._id }, { $set: { payoutLock: { id: 'alive', until: new Date(Date.now() + LOCK_MS) } } });
  await assert.rejects(recordPayout({ astrologerId: c._id, amountPaise: 1, recordedBy: 'x' }), (e) => e.status === 409 && e.code === 'payout_busy');
  await Astrologer.updateOne({ _id: c._id }, { $unset: { payoutLock: 1 } });
}, { timeout: 20_000 });

test('astrologer earnings: today/month windows in IST, paid, due, payouts', async () => {
  await earn(a, 1, 500, new Date(Date.now() - 100 * 86400_000));
  const me = await h.call('GET', '/astrologer/me/earnings', { uid: 'ua' });
  assert.equal(me.status, 200);
  assert.deepEqual(Object.keys(me.body), ['month', 'today', 'paidPaise', 'duePaise', 'payouts']);
  assert.deepEqual(me.body.today, { earnedPaise: 1400, calls: 1, minutes: 2 });
  assert.deepEqual(me.body.month, { earnedPaise: 1400, calls: 1, minutes: 2 });
  assert.equal(me.body.paidPaise, 1300);
  assert.equal(me.body.duePaise, 1400 + 500 - 1300);
  assert.equal(me.body.payouts.length, 2);
  assert.deepEqual(Object.keys(me.body.payouts[0]), ['amountPaise', 'paidAt', 'reference']);
  assert.equal((await h.call('GET', '/astrologer/me/earnings', { uid: 'someone-else' })).status, 403);
  assert.equal((await h.call('GET', '/astrologer/me/earnings', { uid: 'ua', iss: 'admin-bff' })).status, 403);
  assert.equal(istBoundaries(new Date('2026-03-01T20:00:00Z')).today.toISOString(), '2026-03-01T18:30:00.000Z'); // 01:30 IST on 2 Mar
});

test('payouts are admin-only to write (payouts:edit); an editor reads', async () => {
  assert.equal((await h.call('GET', '/admin/payouts/summary', { perms: EDITOR })).status, 200);
  assert.equal((await h.call('POST', '/admin/payouts', { perms: EDITOR, body: { astrologerId: String(a._id), amountPaise: 1 } })).status, 403);
});

test('earning accounting from a real call: share snapshotted per call, the rate in force when billed, voided on a connect failure', async () => {
  const d = new Astrologer({ name: 'D', ratePerMin: 20, platformSharePct: 40, signInEmail: 'd@x.co', uid: 'ud', status: 'active', listed: true, presence: 'online', lastSeenAt: new Date() });
  await d.save();
  h.wallet.fund('payer', 500);
  const req = await h.call('POST', '/calls', { uid: 'payer', name: 'P', body: { astrologerId: String(d._id), requestId: 'p1' } });
  await h.call('POST', `/calls/${req.body.call.id}/accept`, { uid: 'ud' });
  const c = await CallSession.findById(req.body.call.id);
  assert.equal(c.shareSnapshot, 40);
  // the operator edits the share and the payout rate mid-call: minute 1 and the snapshot are untouched, minute 2 uses the NEW rate and the OLD share
  await Astrologer.updateOne({ _id: d._id }, { $set: { platformSharePct: 90, ratePerMin: 99 } });
  h.settings.values.payoutPaisePerCoin = '50';
  await tick(new Date(c.answeredAt.getTime() + 61_000), QUIET);
  const rows = await AstrologerEarning.find({ callId: c._id }).sort({ minute: 1 });
  assert.deepEqual(rows.map((r) => [r.minute, r.coins, r.paise]), [[1, 12, 1200], [2, 12, 600]], 'floor(20 x 60%) = 12 coins; paise at the rate in force when the minute was billed');
  assert.equal((await CallSession.findById(c._id)).coinsCharged, 40, 'the call kept the rate it was requested at');
  await callService.adminEnd(c._id);
  // a second call that never connects after all: refunded, its earnings voided (kept for the books), and they stop counting
  h.wallet.fund('payer3', 500);
  await Astrologer.updateOne({ _id: d._id }, { $set: { presence: 'online', lastSeenAt: new Date(), ratePerMin: 20, platformSharePct: 40 } });
  const req2 = await h.call('POST', '/calls', { uid: 'payer3', name: 'P', body: { astrologerId: String(d._id), requestId: 'p3' } });
  await h.call('POST', `/calls/${req2.body.call.id}/accept`, { uid: 'ud' });
  const c2 = await CallSession.findById(req2.body.call.id);
  assert.equal(await AstrologerEarning.countDocuments({ callId: c2._id, voidedAt: { $exists: false } }), 1);
  await tick(new Date(c2.answeredAt.getTime() + 100_000), { silenceMs: 90_000 });
  assert.equal((await CallSession.findById(c2._id)).endReason, 'failed');
  const sum = (await h.call('GET', '/admin/payouts/summary')).body.astrologers.find((x) => x.name === 'D');
  assert.deepEqual([sum.earnedPaise, sum.duePaise], [1800, 1800], 'only the first call\'s two minutes count');
  assert.equal(await AstrologerEarning.countDocuments({ callId: c2._id, voidedAt: { $exists: true } }), 1);
  assert.equal(h.wallet.balance('payer3'), 500);
  h.settings.values.payoutPaisePerCoin = '100';
});

test('the payout rate is read BEFORE any coin moves: rate unreadable = the minute is not charged, and is charged once when it is readable again', async () => {
  const e = new Astrologer({ name: 'E', ratePerMin: 10, platformSharePct: 30, signInEmail: 'e@x.co', uid: 'ue', status: 'active', listed: true, presence: 'online', lastSeenAt: new Date() });
  await e.save();
  h.wallet.fund('payer2', 100);
  const req = await h.call('POST', '/calls', { uid: 'payer2', name: 'P', body: { astrologerId: String(e._id), requestId: 'p2' } });
  const id = req.body.call.id;
  h.settings.values.payoutPaisePerCoin = '100';
  // engagement goes away right as the astrologer answers: the call is connected, nothing is charged, nothing is earned
  h.settings.down = true;
  const ans = await h.call('POST', `/calls/${id}/accept`, { uid: 'ue' });
  assert.equal(ans.status, 200);
  assert.deepEqual([ans.body.call.status, ans.body.call.minutesBilled], ['connected', 0]);
  assert.equal(h.wallet.balance('payer2'), 100, 'no coin moved on a guess');
  assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 0);
  const c = await CallSession.findById(id);
  const out = await tick(new Date(c.answeredAt.getTime() + 2000), QUIET);
  assert.equal(out.walletUnavailable, 1, 'the ticker defers the minute');
  h.settings.down = false;
  await tick(new Date(c.answeredAt.getTime() + 4000), QUIET);
  assert.equal(h.wallet.balance('payer2'), 90, 'charged once, now');
  assert.equal(await AstrologerEarning.countDocuments({ callId: id }), 1);
  await callService.adminEnd(id);
});
