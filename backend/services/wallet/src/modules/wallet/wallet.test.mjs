// The ledger invariants, against the service module itself (no HTTP). Moved unchanged in behaviour from pooja-api/src/modules/wallet,
// plus the concurrency / idempotency cases the money service must keep.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27231/x node --test --test-concurrency=1 src/modules/wallet/wallet.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import mongoose from 'mongoose';

import { HttpError } from '../../lib/http-error.js';
import { Wallet, WalletTxn } from './wallet.model.js';
import * as wallet from './wallet.service.js';

const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27231/x');
const uid = `u_${Date.now()}`;

before(async () => {
  await mongoose.connect(`${base.protocol}//${base.host}`, { dbName: 'wallet_ledger_tests' });
  await mongoose.connection.dropDatabase();
  await Promise.all([Wallet.init(), WalletTxn.init()]);
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
  assert.equal(String(a.txn._id), String(b.txn._id), 'the retry answers with the FIRST result');
  assert.equal(await wallet.getBalance(uid), 60);
});

test('a debit beyond the balance is refused with the shortfall and changes nothing', async () => {
  await assert.rejects(
    () => wallet.debit({ uid, amount: 999, type: 'booking_debit', idempotencyKey: 'big' }),
    (e) => e instanceof HttpError && e.status === 402 && e.code === 'insufficient_coins' && e.extra.shortfall === 939 && e.extra.needed === 999 && e.extra.balance === 60 && e.extra.type === 'booking_debit',
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
  assert.equal(await WalletTxn.countDocuments({ idempotencyKey: args.idempotencyKey }), 1, 'one ledger row for the key, ever');
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

test('20 parallel debits against a balance that affords 7: exactly 7 succeed, 13 are 402, the ledger equals the balance', async () => {
  const u = `${uid}_twenty`;
  await wallet.credit({ uid: u, amount: 70, type: 'bonus', idempotencyKey: `seed-${u}` });
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) => wallet.debit({ uid: u, amount: 10, type: 'booking_debit', idempotencyKey: `twenty-${u}-${i}` })),
  );
  const ok = results.filter((r) => r.status === 'fulfilled');
  const refused = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 7);
  assert.equal(refused.length, 13);
  assert.ok(refused.every((r) => r.reason instanceof HttpError && r.reason.status === 402 && r.reason.code === 'insufficient_coins'));
  assert.equal(await wallet.getBalance(u), 0);
  assert.deepEqual(await wallet.verifyWallet(u), { uid: u, balance: 0, ledger: 0, ok: true });
  assert.equal(await WalletTxn.countDocuments({ uid: u, status: 'posted', type: 'booking_debit' }), 7);
});

test('ledger equals balance for any mixed sequence, duplicates and concurrency included', async () => {
  const u = `${uid}_fuzz`;
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const ops = [];
  for (let i = 0; i < 120; i++) {
    const kind = ['credit', 'debit', 'debit', 'refund'][rnd(4)];
    const key = `${u}-k${rnd(60)}`; // 60 keys over 120 ops: plenty of duplicate keys (same key, same args)
    ops.push({ kind, key, amount: kind === 'credit' ? 40 : 7 });
  }
  const run = ({ kind, key, amount }) => {
    const k = `${kind}:${key}`; // a key is only ever used for one kind of movement
    if (kind === 'credit') return wallet.credit({ uid: u, amount, type: 'bonus', idempotencyKey: k });
    if (kind === 'refund') return wallet.refund({ uid: u, amount, refType: 'booking', idempotencyKey: k });
    return wallet.debit({ uid: u, amount, type: 'call_debit', idempotencyKey: k });
  };
  for (let i = 0; i < ops.length; i += 12) await Promise.allSettled(ops.slice(i, i + 12).map(run)); // 12 at a time, in parallel
  const v = await wallet.verifyWallet(u);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.ok(v.balance >= 0);
  const pending = await WalletTxn.countDocuments({ uid: u, status: 'pending' });
  assert.equal(pending, 0, 'nothing is left half-done');
  const unique = new Set(ops.map((o) => `${o.kind}:${o.key}`)).size;
  assert.ok((await WalletTxn.countDocuments({ uid: u })) <= unique, 'a duplicate key never made a second row');
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

test('a debit that was applied to the balance but never marked posted is finished, not applied twice', async () => {
  const u = `${uid}_halfdone`;
  await wallet.credit({ uid: u, amount: 40, type: 'bonus', idempotencyKey: `seed-${u}` });
  const txn = await WalletTxn.create({ uid: u, type: 'call_debit', amount: -15, status: 'pending', idempotencyKey: 'half', createdAt: new Date(Date.now() - 120_000) });
  // step 2 happened (balance moved, id recorded in `applied`), step 3 did not
  await Wallet.updateOne({ uid: u }, { $inc: { balance: -15 }, $push: { applied: String(txn._id) } });
  await wallet.reconcilePending({ olderThanMs: 1000 });
  await wallet.reconcilePending({ olderThanMs: 1000 });
  assert.equal(await wallet.getBalance(u), 25, 'charged once');
  assert.equal((await WalletTxn.findById(txn._id)).status, 'posted');
  assert.equal((await wallet.verifyWallet(u)).ok, true);
  // and the retry of the original request (same key) is an answer, not a second charge
  const again = await wallet.debit({ uid: u, amount: 15, type: 'call_debit', idempotencyKey: 'half' });
  assert.equal(again.duplicate, true);
  assert.equal(await wallet.getBalance(u), 25);
});

test('refund returns coins, is typed refund, and a second refund with the same key returns the first', async () => {
  const u = `${uid}_refund`;
  await wallet.credit({ uid: u, amount: 20, type: 'bonus', idempotencyKey: `seed-${u}` });
  await wallet.debit({ uid: u, amount: 20, type: 'booking_debit', refType: 'booking', refId: 'b1', idempotencyKey: 'bk' });
  const r = await wallet.refund({ uid: u, amount: 20, refType: 'booking', refId: 'b1', idempotencyKey: 'bk:refund' });
  assert.equal(r.balance, 20);
  assert.equal(r.txn.type, 'refund');
  const [r2, r3] = await Promise.all([wallet.refund({ uid: u, amount: 20, refType: 'booking', refId: 'b1', idempotencyKey: 'bk:refund' }), wallet.refund({ uid: u, amount: 20, refType: 'booking', refId: 'b1', idempotencyKey: 'bk:refund' })]);
  assert.equal(r2.balance, 20);
  assert.equal(r3.balance, 20);
  assert.equal(await wallet.getBalance(u), 20, 'refunded once');
  assert.equal(await WalletTxn.countDocuments({ uid: u, type: 'refund' }), 1);
  assert.equal((await wallet.verifyWallet(u)).ok, true);
});

test('an adjustment needs a reason; positive credits, negative debits, and the same request id applies once', async () => {
  await assert.rejects(() => wallet.adjust({ uid, amount: 5, reason: '  ' }), (e) => e.code === 'reason_required');
  await assert.rejects(() => wallet.adjust({ uid, amount: 5 }), (e) => e.code === 'reason_required');
  await assert.rejects(() => wallet.adjust({ uid, amount: 0, reason: 'x' }), (e) => e.code === 'bad_amount');
  await assert.rejects(() => wallet.adjust({ uid, amount: 1.5, reason: 'x' }), (e) => e.code === 'bad_amount');
  const before = await wallet.getBalance(uid);
  const r = await wallet.adjust({ uid, amount: 5, reason: 'goodwill', requestId: 'adj1', operator: 'admin' });
  assert.equal(r.balance, before + 5);
  assert.equal(r.txn.createdBy, 'admin');
  assert.equal(r.txn.note, 'goodwill');
  const again = await wallet.adjust({ uid, amount: 5, reason: 'goodwill', requestId: 'adj1', operator: 'admin' });
  assert.equal(again.balance, before + 5, 'a double-clicked adjustment applies once');
  const down = await wallet.adjust({ uid, amount: -3, reason: 'correction', requestId: 'adj2', operator: 'admin' });
  assert.equal(down.balance, before + 2);
  await assert.rejects(() => wallet.adjust({ uid, amount: -100000, reason: 'too much', requestId: 'adj3' }), (e) => e.code === 'insufficient_coins');
});

test('a key cannot be used by another account; amounts and keys are validated', async () => {
  await assert.rejects(() => wallet.debit({ uid: 'someone-else', amount: 10, type: 'call_debit', idempotencyKey: 'same' }), (e) => e.status === 409 && e.code === 'key_reused');
  await assert.rejects(() => wallet.debit({ uid, amount: 0, type: 'call_debit', idempotencyKey: 'z' }), (e) => e.code === 'bad_amount');
  await assert.rejects(() => wallet.debit({ uid, amount: -5, type: 'call_debit', idempotencyKey: 'z' }), (e) => e.code === 'bad_amount');
  await assert.rejects(() => wallet.debit({ uid, amount: 2.5, type: 'call_debit', idempotencyKey: 'z' }), (e) => e.code === 'bad_amount');
  await assert.rejects(() => wallet.debit({ uid, amount: 5, type: 'call_debit' }), (e) => e.code === 'no_key');
  await assert.rejects(() => wallet.debit({ amount: 5, type: 'call_debit', idempotencyKey: 'z' }), (e) => e.code === 'no_user');
});

test('findByKey answers what happened to a key: posted, failed, or never seen', async () => {
  const u = `${uid}_find`;
  await wallet.credit({ uid: u, amount: 10, type: 'bonus', idempotencyKey: `seed-${u}` });
  await wallet.debit({ uid: u, amount: 4, type: 'booking_debit', idempotencyKey: `${u}-ok` });
  await assert.rejects(() => wallet.debit({ uid: u, amount: 400, type: 'booking_debit', idempotencyKey: `${u}-no` }));
  assert.equal((await wallet.findByKey(`${u}-ok`)).status, 'posted');
  assert.equal((await wallet.findByKey(`${u}-no`)).status, 'failed');
  assert.equal(await wallet.findByKey(`${u}-never`), null);
  await assert.rejects(() => wallet.findByKey(`${u}-ok`, { uid: 'other' }), (e) => e.status === 409);
  await assert.rejects(() => wallet.findByKey(''), (e) => e.code === 'no_key');
});

test('listTransactions: newest first, posted only, paged by `before`, capped', async () => {
  const u = `${uid}_list`;
  for (let i = 0; i < 5; i++) await wallet.credit({ uid: u, amount: 1, type: 'bonus', idempotencyKey: `${u}-${i}` });
  await assert.rejects(() => wallet.debit({ uid: u, amount: 999, type: 'booking_debit', idempotencyKey: `${u}-fail` }));
  const rows = await wallet.listTransactions(u, { limit: 3 });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.status === 'posted'));
  assert.ok(rows[0].createdAt >= rows[2].createdAt);
  assert.equal((await wallet.listTransactions(u, { limit: 1000 })).length, 5, 'the failed row is never listed');
});
