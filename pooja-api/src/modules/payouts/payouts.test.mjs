import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import mongoose from 'mongoose';

import { startApp } from '../_harness.mjs';
import { Astrologer } from '../astrologers/astrologer.model.js';
import * as astrologers from '../astrologers/index.js';
import * as calls from '../calls/index.js';
import * as payouts from './index.js';
import { AstrologerEarning, Payout } from './payout.model.js';
import { istBoundaries } from './payout.service.js';

let app;
let api;
let a;
let b;
const earn = (astro, minute, paise, at = new Date(), extra = {}) =>
  AstrologerEarning.create({ astrologerId: astro._id, callId: extra.callId ?? new mongoose.Types.ObjectId(), minute, coins: paise / 100, paise, at, ...extra });

before(async () => {
  app = await startApp('calls_test_payouts', [astrologers, calls, payouts]);
  api = app.api;
  await calls.seed();
  a = await Astrologer.create({ name: 'A', ratePerMin: 10, signInEmail: 'a@x.co', uid: 'ua', status: 'active' });
  b = await Astrologer.create({ name: 'B', ratePerMin: 10, signInEmail: 'b@x.co' });
});
after(async () => app.close());

test('summary: earned, paid and due per astrologer; voided minutes do not count', async () => {
  const call = new mongoose.Types.ObjectId();
  await earn(a, 1, 700, new Date(), { callId: call });
  await earn(a, 2, 700, new Date(), { callId: call });
  await earn(a, 3, 700, new Date(), { callId: call, voidedAt: new Date() });
  const s = await api('GET', '/admin/payouts/summary');
  const row = s.body.astrologers.find((x) => x.name === 'A');
  assert.deepEqual([row.earnedPaise, row.paidPaise, row.duePaise], [1400, 0, 1400]);
  assert.deepEqual(s.body.astrologers.find((x) => x.name === 'B').duePaise, 0);
});

test('recording a payout: reduces due, cannot exceed it, validates the amount', async () => {
  const ok = await api('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 1000, reference: 'UTR123' } });
  assert.equal(ok.status, 201);
  const over = await api('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 401 } });
  assert.equal(over.status, 409);
  assert.equal(over.body.code, 'exceeds_due');
  assert.equal(over.body.duePaise, 400);
  assert.equal((await api('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 0 } })).status, 400);
  assert.equal((await api('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 1.5 } })).status, 400);
  assert.equal((await api('POST', '/admin/payouts', { body: { astrologerId: 'nope', amountPaise: 1 } })).status, 404);
  const s = await api('GET', '/admin/payouts/summary');
  assert.deepEqual(s.body.astrologers.find((x) => x.name === 'A'), { id: String(a._id), name: 'A', earnedPaise: 1400, paidPaise: 1000, duePaise: 400 });
  const list = await api('GET', `/admin/payouts?astrologerId=${a._id}`);
  assert.equal(list.body.payouts.length, 1);
  assert.equal(list.body.payouts[0].reference, 'UTR123');
});

test('two simultaneous payouts cannot both fit under the same due amount', async () => {
  const rs = await Promise.all([1, 2, 3, 4].map(() => api('POST', '/admin/payouts', { body: { astrologerId: String(a._id), amountPaise: 300 } })));
  assert.equal(rs.filter((r) => r.status === 201).length, 1, 'only 400 due: one 300 fits');
  assert.equal(await Payout.countDocuments({ astrologerId: a._id }), 2);
});

test('astrologer earnings: today/month windows in IST, paid, due, payouts', async () => {
  const old = new Date(Date.now() - 100 * 86400_000);
  await earn(a, 1, 500, old);
  const me = await api('GET', '/astrologer/me/earnings', { uid: 'ua' });
  assert.equal(me.status, 200);
  assert.deepEqual(me.body.today, { earnedPaise: 1400, calls: 1, minutes: 2 });
  assert.deepEqual(me.body.month, { earnedPaise: 1400, calls: 1, minutes: 2 });
  assert.equal(me.body.paidPaise, 1300);
  assert.equal(me.body.duePaise, 1400 + 500 - 1300);
  assert.equal(me.body.payouts.length, 2);
  assert.equal((await api('GET', '/astrologer/me/earnings', { uid: 'someone-else' })).status, 403);
  // 23:00 IST on the 31st is already the 1st in UTC terms... boundaries are IST days
  const { today } = istBoundaries(new Date('2026-03-01T20:00:00Z')); // 01:30 IST on 2 Mar
  assert.equal(today.toISOString(), '2026-03-01T18:30:00.000Z');
});

