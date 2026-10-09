import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import mongoose from 'mongoose';

import { HttpError } from '../../lib/http-error.js';
import * as wallet from './wallet.service.js';
import { WalletTxn } from './wallet.model.js';

const URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27117/wallet_test';
const uid = `u_${Date.now()}`;

before(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([mongoose.model('Wallet').init(), mongoose.model('WalletTxn').init()]);
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('credit then debit moves the balance and keeps the ledger equal', async () => {
  await wallet.credit({ uid, amount: 100, type: 'recharge', refType: 'order', refId: 'o1', idempotencyKey: 'c1' });
  const r = await wallet.debit({ uid, amount: 30, type: 'booking_debit', idempotencyKey: 'd1' });
  assert.equal(r.balance, 70);
  assert.deepEqual(await wallet.verifyWallet(uid), { uid, balance: 70, ledger: 70, ok: true });
});

test('the same idempotency key never charges twice', async () => {
  const a = await wallet.debit({ uid, amount: 10, type: 'call_debit', idempotencyKey: 'same' });
  const b = await wallet.debit({ uid, amount: 10, type: 'call_debit', idempotencyKey: 'same' });
  assert.equal(a.balance, 60);
  assert.equal(b.balance, 60);
  assert.equal(b.duplicate, true);
  assert.equal(await wallet.getBalance(uid), 60);
});

test('a debit beyond the balance is refused and changes nothing', async () => {
  await assert.rejects(
    () => wallet.debit({ uid, amount: 999, type: 'booking_debit', idempotencyKey: 'big' }),
    (e) => e instanceof HttpError && e.status === 402 && e.code === 'insufficient_coins' && e.extra.shortfall === 939,
  );
  assert.equal(await wallet.getBalance(uid), 60);
  assert.equal((await wallet.verifyWallet(uid)).ok, true);
});

test('a refused debit can be retried with the same key after a top-up, and still charges once', async () => {
  const u = `retry_${Date.now()}`;
  await wallet.credit({ uid: u, amount: 10, type: 'recharge', idempotencyKey: `${u}-c0` });
  const args = { uid: u, amount: 50, type: 'booking_debit', idempotencyKey: `${u}-d` };
  await assert.rejects(() => wallet.debit(args), (e) => e instanceof HttpError && e.status === 402 && e.extra?.shortfall === 40);
  await wallet.credit({ uid: u, amount: 100, type: 'recharge', idempotencyKey: `${u}-c1` });
  const ok = await wallet.debit(args);
  assert.equal(ok.balance, 60);
  // Two more submits of the same key, one in parallel pair, never charge again.
  const [a, b] = await Promise.all([wallet.debit(args), wallet.debit(args)]);
  assert.equal(a.balance, 60);
  assert.equal(b.balance, 60);
  assert.deepEqual(await wallet.verifyWallet(u), { uid: u, balance: 60, ledger: 60, ok: true });
});

test('parallel debits can never overdraw', async () => {
  const u = `${uid}_race`;
  await wallet.credit({ uid: u, amount: 50, type: 'bonus', idempotencyKey: `seed-${u}` });
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => wallet.debit({ uid: u, amount: 10, type: 'call_debit', idempotencyKey: `race-${i}` })),
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, 5);
  assert.equal(await wallet.getBalance(u), 0);
  assert.equal((await wallet.verifyWallet(u)).ok, true);
});

test('a crashed pending debit is finished exactly once by the reconciler', async () => {
  const u = `${uid}_crash`;
  await wallet.credit({ uid: u, amount: 40, type: 'bonus', idempotencyKey: `seed-${u}` });
  // Simulate a crash after opening the ledger row but before applying it.
  await WalletTxn.create({ uid: u, type: 'call_debit', amount: -15, status: 'pending', idempotencyKey: 'crashed', createdAt: new Date(Date.now() - 120_000) });
  const r1 = await wallet.reconcilePending({ olderThanMs: 1000 });
  const r2 = await wallet.reconcilePending({ olderThanMs: 1000 });
  assert.ok(r1.finished >= 1);
  assert.equal(r2.finished, 0);
  assert.equal(await wallet.getBalance(u), 25);
  assert.equal((await wallet.verifyWallet(u)).ok, true);
});

test('refund returns coins and is typed refund', async () => {
  const u = `${uid}_refund`;
  await wallet.credit({ uid: u, amount: 20, type: 'bonus', idempotencyKey: `seed-${u}` });
  await wallet.debit({ uid: u, amount: 20, type: 'booking_debit', refType: 'booking', refId: 'b1', idempotencyKey: 'bk' });
  const r = await wallet.refund({ uid: u, amount: 20, refType: 'booking', refId: 'b1', idempotencyKey: 'bk:refund' });
  assert.equal(r.balance, 20);
  assert.equal(r.txn.type, 'refund');
});

test('an adjustment needs a reason', async () => {
  await assert.rejects(() => wallet.adjust({ uid, amount: 5, reason: '  ' }), (e) => e.code === 'reason_required');
  const r = await wallet.adjust({ uid, amount: 5, reason: 'goodwill', requestId: 'adj1', operator: 'admin' });
  assert.equal(r.balance, 65);
});
