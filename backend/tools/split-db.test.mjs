// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27141/x node --test --test-concurrency=1 tools/split-db.test.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import mongoose from 'mongoose';

import { MANIFEST, splitDb } from './split-db.mjs';

const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27141/x');
const cluster = `${base.protocol}//${base.host}`;
const SRC = 'splitdb_src';
const sourceUri = `${cluster}/${SRC}`;
let conn;
const db = (n) => conn.useDb(n, { useCache: false }).db;
const quiet = () => {};

before(async () => {
  conn = await mongoose.createConnection(cluster).asPromise();
  for (const n of [SRC, ...Object.keys(MANIFEST)]) await db(`${n}`).dropDatabase();
  const s = db(SRC);
  await s.collection('flags').insertMany([{ key: 'a', enabled: true }, { key: 'b', enabled: false }]);
  await s.collection('settings').insertMany(Array.from({ length: 1200 }, (_, i) => ({ key: `k${i}`, value: String(i) })));
  await s.collection('announcements').insertOne({ title: 'x' });
  await s.collection('visitors').insertMany([{ deviceId: 'd1' }, { deviceId: 'd2' }]);
  // no `events` collection at all: a source that never recorded any
  await s.collection('users').insertMany([{ uid: 'u1', contact: '+911', acceptedPolicies: { terms: 2 } }, { uid: 'u2', contact: 'b@example.com' }]);
  await s.collection('operators').insertOne({ username: 'admin', passwordHash: 'scrypt$aa$bb', role: 'admin' });
  await s.collection('auditlogs').insertMany(Array.from({ length: 700 }, (_, i) => ({ operator: 'admin', path: `/api/x/${i}` })));
  await s.collection('policies').insertOne({ key: 'terms', version: 2 });
  await s.collection('wallets').insertOne({ uid: 'u1', balance: 5 });
});
after(async () => {
  for (const n of [SRC, ...Object.keys(MANIFEST)]) await db(n).dropDatabase();
  await conn.close();
});

const counts = async (name) => Object.fromEntries(await Promise.all(MANIFEST.engagement.map(async (c) => [c, await db(name).collection(c).countDocuments()])));

describe('split-db engagement', () => {
  test('manifest names the real collections of the engagement models', () => {
    assert.deepEqual(MANIFEST.engagement, ['flags', 'settings', 'announcements', 'visitors', 'events']);
  });

  test('--dry-run reads and counts but writes nothing', async () => {
    const rows = await splitDb({ sourceUri, services: ['engagement'], dryRun: true, log: quiet });
    assert.deepEqual(rows.map((r) => r.source), [2, 1200, 1, 2, 0]);
    assert.deepEqual(await counts('engagement'), { flags: 0, settings: 0, announcements: 0, visitors: 0, events: 0 });
  });

  test('copies every document with its _id, and only the manifest collections', async () => {
    const rows = await splitDb({ sourceUri, services: ['engagement'], log: quiet });
    assert.deepEqual(rows.map((r) => r.inserted), [2, 1200, 1, 2, 0]);
    assert.deepEqual(await counts('engagement'), { flags: 2, settings: 1200, announcements: 1, visitors: 2, events: 0 });
    const a = await db(SRC).collection('flags').findOne({ key: 'a' });
    assert.deepEqual(await db('engagement').collection('flags').findOne({ key: 'a' }), a);
    assert.equal(await db('engagement').collection('users').countDocuments(), 0, 'users stays out of engagement');
    assert.equal(await db('identity').collection('users').countDocuments(), 0, 'and nothing was copied to identity by an engagement-only run');
  });

  test('is idempotent: a second run inserts nothing', async () => {
    const rows = await splitDb({ sourceUri, services: ['engagement'], log: quiet });
    assert.deepEqual(rows.map((r) => r.inserted), [0, 0, 0, 0, 0]);
    assert.deepEqual(rows.map((r) => r.targetAfter), [2, 1200, 1, 2, 0]);
  });

  test('never deletes from or changes the source', async () => {
    assert.equal(await db(SRC).collection('flags').countDocuments(), 2);
    assert.equal(await db(SRC).collection('settings').countDocuments(), 1200);
    assert.equal(await db(SRC).collection('users').countDocuments(), 2);
    // even when the target holds extra documents, or the source shrinks, nothing in the source is touched
    await db('engagement').collection('flags').insertOne({ key: 'only-in-target' });
    await splitDb({ sourceUri, services: ['engagement'], log: quiet });
    assert.equal(await db('engagement').collection('flags').countDocuments(), 3, 'extra target docs are kept');
    assert.equal(await db(SRC).collection('flags').countDocuments(), 2);
  });

  test('re-running does not clobber edits made in the service; --overwrite does', async () => {
    await db('engagement').collection('flags').updateOne({ key: 'a' }, { $set: { enabled: false } });
    await splitDb({ sourceUri, services: ['engagement'], log: quiet });
    assert.equal((await db('engagement').collection('flags').findOne({ key: 'a' })).enabled, false);
    const rows = await splitDb({ sourceUri, services: ['engagement'], overwrite: true, log: quiet });
    assert.equal((await db('engagement').collection('flags').findOne({ key: 'a' })).enabled, true);
    assert.ok(rows[0].replaced >= 1);
  });

  test('refuses an unknown service and a target that is the source', async () => {
    await assert.rejects(splitDb({ sourceUri, services: ['nope'], log: quiet }), /Unknown service/);
    await assert.rejects(splitDb({ sourceUri: `${cluster}/engagement`, services: ['engagement'], log: quiet }), /Refusing/);
    await assert.rejects(splitDb({ sourceUri: cluster, services: ['engagement'], log: quiet }), /must name/);
  });

  test('the CLI prints per-collection counts and honours --dry-run', async () => {
    const run = promisify(execFile);
    const { stdout } = await run(process.execPath, [fileURLToPath(new URL('./split-db.mjs', import.meta.url)), '--source', sourceUri, '--dry-run']);
    assert.match(stdout, /\[dry-run\]/);
    assert.match(stdout, /engagement\.settings\s+source=1200/);
    const { stdout: help } = await run(process.execPath, [fileURLToPath(new URL('./split-db.mjs', import.meta.url)), '--help']);
    assert.match(help, /usage/);
  });
});

describe('split-db identity', () => {
  const COLS = ['users', 'operators', 'auditlogs', 'policies'];
  const idCounts = async () => Object.fromEntries(await Promise.all(COLS.map(async (c) => [c, await db('identity').collection(c).countDocuments()])));

  test('manifest names the real collections of the identity models (verified against mongoose pluralisation in pooja-api)', () => {
    assert.deepEqual(MANIFEST.identity, COLS);
  });

  test('--dry-run counts everything and writes nothing', async () => {
    const rows = await splitDb({ sourceUri, services: ['identity'], dryRun: true, log: quiet });
    assert.deepEqual(rows.map((r) => [r.collection, r.source]), [['users', 2], ['operators', 1], ['auditlogs', 700], ['policies', 1]]);
    assert.deepEqual(await idCounts(), { users: 0, operators: 0, auditlogs: 0, policies: 0 });
  });

  test('copies with _id, hashes and acceptances intact (batches of 500 included); wallets stay in the source only', async () => {
    const rows = await splitDb({ sourceUri, services: ['identity'], log: quiet });
    assert.deepEqual(rows.map((r) => r.inserted), [2, 1, 700, 1]);
    assert.deepEqual(await idCounts(), { users: 2, operators: 1, auditlogs: 700, policies: 1 });
    const u = await db(SRC).collection('users').findOne({ uid: 'u1' });
    assert.deepEqual(await db('identity').collection('users').findOne({ uid: 'u1' }), u);
    assert.deepEqual((await db('identity').collection('users').findOne({ uid: 'u1' })).acceptedPolicies, { terms: 2 });
    assert.equal((await db('identity').collection('operators').findOne({ username: 'admin' })).passwordHash, 'scrypt$aa$bb');
    assert.equal(await db('identity').collection('wallets').countDocuments(), 0);
  });

  test('a second run inserts nothing and does not clobber what identity has changed since', async () => {
    await db('identity').collection('users').updateOne({ uid: 'u2' }, { $set: { blocked: true } });
    const rows = await splitDb({ sourceUri, services: ['identity'], log: quiet });
    assert.deepEqual(rows.map((r) => r.inserted), [0, 0, 0, 0]);
    assert.deepEqual(rows.map((r) => r.targetAfter), [2, 1, 700, 1]);
    assert.equal((await db('identity').collection('users').findOne({ uid: 'u2' })).blocked, true);
  });

  test('the source is untouched, and both services can be split in one run', async () => {
    assert.equal(await db(SRC).collection('auditlogs').countDocuments(), 700);
    assert.equal(await db(SRC).collection('users').countDocuments(), 2);
    const rows = await splitDb({ sourceUri, services: ['engagement', 'identity'], log: quiet });
    assert.equal(rows.length, MANIFEST.engagement.length + COLS.length);
  });
});

describe('split-db catalog', () => {
  const COLLECTIONS = MANIFEST.catalog;
  const ONE_MB = Buffer.alloc(1024 * 1024 + 123, 7); // > one 255 KB GridFS chunk, so the copy has several chunks to move
  let fileId;
  const catCounts = async () => Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await db('catalog').collection(c).countDocuments()])));

  before(async () => {
    const s = db(SRC);
    await s.collection('deities').insertMany([{ slug: 'shiva', name: 'Shiva' }, { slug: 'durga', name: 'Durga' }]);
    await s.collection('temples').insertOne({ slug: 'kashi', name: 'Kashi', liveUrl: 'https://www.youtube.com/watch?v=iD7bdfmqzXE' });
    await s.collection('poojas').insertOne({ slug: 'rudrabhishek', title: 'Rudrabhishek', packages: [{ key: 'individual', persons: 1, coins: 351 }] });
    await s.collection('chadhavalistings').insertOne({ slug: 'pitru', title: 'Pitru', offerings: [{ key: 'diya', coins: 21 }] });
    await s.collection('homesections').insertMany(Array.from({ length: 600 }, (_, i) => ({ key: `s${i}`, source: 'custom' })));
    await s.collection('livestreams').insertOne({ slug: 'kashi', templeSlug: 'kashi', sourceType: 'youtube', url: 'x' });
    // real GridFS in the source: a multi-chunk file
    const bucket = new mongoose.mongo.GridFSBucket(s, { bucketName: 'media' });
    const up = bucket.openUploadStream('big.png', { contentType: 'image/png' });
    fileId = up.id;
    await new Promise((ok, no) => { up.on('finish', ok); up.on('error', no); up.end(ONE_MB); });
    // NOT the catalog's: settings (engagement), bookings / reviews / chadhava orders (monolith until phase 5)
    await s.collection('poojareviews').insertOne({ bookingId: 'b1', poojaSlug: 'rudrabhishek', rating: 5 });
    await s.collection('bookings').insertOne({ uid: 'u1', poojaSlug: 'rudrabhishek' });
    await s.collection('chadhavaorders').insertOne({ uid: 'u1', ref: 'CHD-AAAAA' });
  });

  test('the manifest names the REAL collections: every catalog model\'s collection is listed, and nothing else is (bar GridFS)', async () => {
    await import('../services/catalog/src/models.js');
    const real = Object.values(mongoose.models).map((m) => m.collection.name);
    // Only models registered by THIS process: the catalog barrel (the engagement/identity services are not imported here).
    for (const name of real) assert.ok(COLLECTIONS.includes(name), `${name} is a catalog collection but missing from MANIFEST.catalog`);
    for (const name of COLLECTIONS.filter((c) => !c.startsWith('media.'))) assert.ok(real.includes(name), `${name} in MANIFEST.catalog is not a catalog model's collection`);
    assert.deepEqual(COLLECTIONS.filter((c) => c.startsWith('media.')), ['media.files', 'media.chunks']);
    for (const owned of ['settings', 'bookings', 'poojareviews', 'chadhavaorders']) assert.ok(!COLLECTIONS.includes(owned), `${owned} is not the catalog's`);
  });

  test('--dry-run counts (GridFS included) and writes nothing', async () => {
    const rows = await splitDb({ sourceUri, services: ['catalog'], dryRun: true, log: quiet });
    const by = Object.fromEntries(rows.map((r) => [r.collection, r.source]));
    assert.deepEqual([by.deities, by.temples, by.poojas, by.chadhavalistings, by.homesections, by.livestreams, by['media.files']], [2, 1, 1, 1, 600, 1, 1]);
    assert.ok(by['media.chunks'] >= 5, `chunks ${by['media.chunks']}`);
    assert.equal(by.knowledges, 0, 'a collection the source never had is simply empty');
    assert.ok(Object.values(await catCounts()).every((n) => n === 0));
  });

  test('copies the catalog collections and the GridFS bucket; leaves the other services\' collections where they are', async () => {
    const rows = await splitDb({ sourceUri, services: ['catalog'], log: quiet });
    assert.equal(rows.find((r) => r.collection === 'homesections').inserted, 600);
    const t = await db(SRC).collection('temples').findOne({ slug: 'kashi' });
    assert.deepEqual(await db('catalog').collection('temples').findOne({ slug: 'kashi' }), t);
    assert.deepEqual((await db('catalog').collection('poojas').findOne({ slug: 'rudrabhishek' })).packages, [{ key: 'individual', persons: 1, coins: 351 }]);
    for (const other of ['poojareviews', 'bookings', 'chadhavaorders', 'settings']) assert.equal(await db('catalog').collection(other).countDocuments(), 0, `${other} stays out of catalog`);
  });

  test('field ORDER survives the copy (it is the key order of every API response served from the copy)', async () => {
    const order = async (name) => Object.keys(await db(name).collection('temples').findOne({ slug: 'kashi' }));
    assert.deepEqual(await order('catalog'), await order(SRC));
    assert.deepEqual(await order('catalog'), ['_id', 'slug', 'name', 'liveUrl'], 'not alphabetical');
  });

  test('the copied GridFS file is served byte for byte from the catalog database, under its original id', async () => {
    const bucket = new mongoose.mongo.GridFSBucket(db('catalog'), { bucketName: 'media' });
    const chunks = [];
    for await (const c of bucket.openDownloadStream(fileId)) chunks.push(c);
    assert.ok(Buffer.concat(chunks).equals(ONE_MB));
    const part = [];
    for await (const c of bucket.openDownloadStream(fileId, { start: 100, end: 200 })) part.push(c);
    assert.ok(Buffer.concat(part).equals(ONE_MB.subarray(100, 200)));
    assert.equal((await bucket.find({ _id: fileId }).next()).contentType, 'image/png');
  });

  test('a second run inserts nothing (counts identical), a catalog edit survives it, and the source is untouched', async () => {
    await db('catalog').collection('deities').updateOne({ slug: 'shiva' }, { $set: { name: 'Edited in catalog' } });
    const before = await catCounts();
    const rows = await splitDb({ sourceUri, services: ['catalog'], log: quiet });
    assert.ok(rows.every((r) => r.inserted === 0), JSON.stringify(rows.filter((r) => r.inserted)));
    assert.deepEqual(await catCounts(), before);
    assert.equal((await db('catalog').collection('deities').findOne({ slug: 'shiva' })).name, 'Edited in catalog');
    assert.equal((await db(SRC).collection('deities').findOne({ slug: 'shiva' })).name, 'Shiva');
    assert.equal(await db(SRC).collection('homesections').countDocuments(), 600);
  });
});

describe('split-db wallet', () => {
  const COLLECTIONS = ['wallets', 'wallettxns', 'coinpacks', 'coinorders'];
  const monoSrc = fileURLToPath(new URL('../../pooja-api/src/modules/wallet/wallet.service.js', import.meta.url));
  const haveMono = existsSync(monoSrc);
  const wCounts = async () => Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await db('wallet').collection(c).countDocuments()])));
  const UIDS = Array.from({ length: 30 }, (_, i) => `devotee-${i}`);
  let monoMongoose;

  before(async () => {
    if (!haveMono) return;
    // The source is written by the MONOLITH's own wallet.service (its own mongoose), so the data has exactly the shape production has.
    monoMongoose = (await import(new URL('../../pooja-api/node_modules/mongoose/index.js', import.meta.url).href)).default;
    const ms = await import(monoSrc);
    const models = await import(fileURLToPath(new URL('../../pooja-api/src/modules/coins/coins.model.js', import.meta.url)));
    await monoMongoose.connect(cluster, { dbName: SRC });
    await Promise.all(Object.values(monoMongoose.models).map((m) => m.init()));
    for (const [i, uid] of UIDS.entries()) {
      await ms.credit({ uid, amount: 100 + i, type: 'recharge', refType: 'order', refId: `o${i}`, idempotencyKey: `order:${uid}` });
      await ms.debit({ uid, amount: 30, type: 'booking_debit', refType: 'booking', idempotencyKey: `booking:${uid}:r1`, note: 'Navratri' });
      if (i % 3 === 0) await ms.refund({ uid, amount: 30, refType: 'booking', idempotencyKey: `booking:${uid}:r1:refund` });
      if (i % 5 === 0) await ms.adjust({ uid, amount: -7, reason: 'correction', requestId: `adj-${i}`, operator: 'root' });
    }
    await assert.rejects(ms.debit({ uid: 'devotee-1', amount: 100000, type: 'call_debit', idempotencyKey: 'too-much' })); // a failed row
    await models.CoinPack.insertMany([{ coins: 30, price: 20, order: 1 }, { coins: 120, price: 100, order: 2, saleEndsAt: new Date('2030-01-01') }]);
    await models.CoinOrder.insertMany([{ uid: 'devotee-0', coins: 120, price: 100, amountPaise: 10000, provider: 'razorpay', razorpayOrderId: 'order_RZ1', razorpayPaymentId: 'pay_1', status: 'paid', paidAt: new Date() }]);
    await db(SRC).collection('wallettxns').insertOne({ uid: 'devotee-2', type: 'call_debit', amount: -4, status: 'pending', idempotencyKey: 'call:x:min:1', createdAt: new Date() });
    await monoMongoose.disconnect();
    // NOT the wallet's: settings (engagement), bookings / chadhava orders (the monolith until phase 5)
    await db(SRC).collection('settings').insertOne({ key: 'coinsPerRupee', value: '1' });
  });

  test('the manifest names the REAL collections of the wallet service\'s models AND of the monolith\'s (which wrote the data)', async () => {
    assert.deepEqual(MANIFEST.wallet, COLLECTIONS);
    await import('../services/wallet/src/models.js');
    const mine = Object.values(mongoose.models).map((m) => m.collection.name).filter((n) => COLLECTIONS.includes(n) || n.startsWith('wallet') || n.startsWith('coin'));
    assert.deepEqual([...mine].sort(), [...COLLECTIONS].sort());
    if (haveMono) assert.deepEqual((await db(SRC).listCollections().toArray()).map((c) => c.name).filter((n) => COLLECTIONS.includes(n)).sort(), [...COLLECTIONS].sort(), 'the monolith wrote exactly these');
    for (const other of ['settings', 'bookings', 'chadhavaorders', 'users']) assert.ok(!MANIFEST.wallet.includes(other));
  });

  test('--dry-run counts and writes nothing', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['wallet'], dryRun: true, log: quiet });
    const by = Object.fromEntries(rows.map((r) => [r.collection, r.source]));
    assert.equal(by.wallets, UIDS.length + 1, 'the 30 devotees + the decoy wallet every service test shares');
    assert.ok(by.wallettxns > UIDS.length * 2, `ledger rows ${by.wallettxns}`);
    assert.deepEqual([by.coinpacks, by.coinorders], [2, 1]);
    assert.deepEqual(await wCounts(), { wallets: 0, wallettxns: 0, coinpacks: 0, coinorders: 0 });
  });

  test('the real run copies every document with its _id and field order; settings and the other services\' collections stay where they were', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['wallet'], log: quiet });
    assert.deepEqual(rows.map((r) => r.inserted), rows.map((r) => r.source));
    const after = await wCounts();
    for (const c of COLLECTIONS) assert.equal(after[c], await db(SRC).collection(c).countDocuments(), c);
    const t = await db(SRC).collection('wallettxns').findOne({ idempotencyKey: 'order:devotee-0' });
    const copied = await db('wallet').collection('wallettxns').findOne({ idempotencyKey: 'order:devotee-0' });
    assert.deepEqual(copied, t);
    assert.deepEqual(Object.keys(copied), Object.keys(t), 'field order preserved');
    assert.equal((await db('wallet').collection('wallettxns').findOne({ idempotencyKey: 'call:x:min:1' })).status, 'pending', 'a pending row is copied as pending (the service\'s reconciler finishes it)');
    assert.equal((await db('wallet').collection('coinorders').findOne({ razorpayOrderId: 'order_RZ1' })).razorpayPaymentId, 'pay_1');
    assert.equal(await db('wallet').collection('settings').countDocuments(), 0);
    assert.equal(await db('engagement').collection('settings').countDocuments() >= 0, true);
  });

  test('verifyWallet (the wallet service\'s own invariant: balance == the sum of posted ledger rows) passes for every copied wallet', { skip: !haveMono }, async () => {
    const { verifyWallet, reconcilePending } = await import('../services/wallet/src/modules/wallet/wallet.service.js');
    await mongoose.connect(cluster, { dbName: 'wallet' });
    try {
      for (const uid of UIDS) {
        const v = await verifyWallet(uid);
        assert.equal(v.ok, true, JSON.stringify(v));
        assert.ok(v.balance >= 0);
      }
      // devotee-0: +100 recharge, -30 booking, +30 refund, -7 adjustment
      assert.deepEqual(await verifyWallet('devotee-0'), { uid: 'devotee-0', balance: 93, ledger: 93, ok: true });
      // and the copied pending row is finished exactly once by the service's reconciler, keeping the invariant
      const r = await reconcilePending({ olderThanMs: 0 });
      assert.ok(r.finished >= 1);
      assert.equal((await reconcilePending({ olderThanMs: 0 })).finished, 0);
      assert.equal((await verifyWallet('devotee-2')).ok, true);
    } finally {
      await mongoose.connection.close(); // NOT mongoose.disconnect(): that would also close this file's own connection
    }
  });

  test('a second run inserts nothing, a wallet edit made since survives it, and the source is untouched', { skip: !haveMono }, async () => {
    const before = await wCounts();
    await db('wallet').collection('coinpacks').updateOne({ coins: 30 }, { $set: { price: 21 } });
    const rows = await splitDb({ sourceUri, services: ['wallet'], log: quiet });
    assert.ok(rows.every((r) => r.inserted === 0), JSON.stringify(rows));
    assert.deepEqual(await wCounts(), before);
    assert.equal((await db('wallet').collection('coinpacks').findOne({ coins: 30 })).price, 21);
    assert.equal((await db(SRC).collection('coinpacks').findOne({ coins: 30 })).price, 20);
  });

  test('all four services can be split in one run', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: Object.keys(MANIFEST), dryRun: true, log: quiet });
    assert.equal(rows.length, Object.values(MANIFEST).reduce((n, c) => n + c.length, 0));
  });
});

describe('split-db orders', () => {
  const COLLECTIONS = ['bookings', 'chadhavaorders', 'poojareviews', 'orderintents'];
  const monoDir = fileURLToPath(new URL('../../pooja-api/src/', import.meta.url));
  const haveMono = existsSync(`${monoDir}modules/bookings/booking.model.js`);
  const oCounts = async () => Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await db('orders').collection(c).countDocuments()])));
  let M; // the monolith's mongoose
  let intentKeys;
  const old = new Date(Date.now() - 3_600_000);

  before(async () => {
    if (!haveMono) return;
    // the catalog block above left decoy rows in these three (to prove they stay out of catalog); this block wants them clean
    for (const c of ['bookings', 'chadhavaorders', 'poojareviews']) await db(SRC).collection(c).deleteMany({});
    // The source is written by the MONOLITH's own models (its own mongoose), so the data has exactly the shape production has.
    M = (await import(new URL('../../pooja-api/node_modules/mongoose/index.js', import.meta.url).href)).default;
    await M.connect(cluster, { dbName: SRC });
    const { Booking } = await import(`${monoDir}modules/bookings/booking.model.js`);
    const { ChadhavaOrder } = await import(`${monoDir}modules/chadhava/chadhava.model.js`);
    const { PoojaReview } = await import(`${monoDir}modules/poojas/pooja.model.js`);
    const { WalletIntent } = await import(`${monoDir}lib/wallet-saga.js`);
    await Promise.all([Booking, ChadhavaOrder, PoojaReview, WalletIntent].map((m) => m.init()));
    const base = (i) => ({ uid: `u${i}`, requestId: `req-split-${i}`, kind: 'pooja', poojaSlug: 'navratri', poojaTitle: 'Navratri', templeSlug: 'kashi', templeName: 'Kashi', place: 'Varanasi', poojaDate: null, packageKey: 'family', packageName: 'Family', persons: 1, names: [{ name: 'Asha', gotra: 'K' }], prasad: false, packageCoins: 100, prasadCoins: 0, totalCoins: 100, cancelBy: null, devoteeName: 'Asha', gotra: 'K' });
    for (let i = 0; i < 520; i++) {
      await Booking.create({ ...base(i), bookingRef: `BKT-${String(i).padStart(5, 'A')}`, walletTxnId: `tx${i}`, status: i % 4 === 0 ? 'performed' : 'booked', statusHistory: [{ status: 'booked', at: old }] });
    }
    await ChadhavaOrder.create({ uid: 'u1', ref: 'CHD-AAAAA', requestId: 'req-c-1', listingSlug: 'pitru', listingTitle: 'Pitru', items: [{ key: 'flowers', title: 'Flowers', qty: 2, coins: 11 }], totalCoins: 22, status: 'booked', walletTxnId: 'tc1' });
    await ChadhavaOrder.create({ uid: 'u2', ref: 'CHD-BBBBB', amount: 51, itemsTotal: 46, serviceFee: 5, total: 51, status: 'offered' }); // an old free-amount row: legacy fields, no requestId
    await PoojaReview.create({ bookingId: 'b1', bookingRef: 'BKT-AAAAA', uid: 'u0', poojaSlug: 'navratri', name: 'Asha', rating: 5, text: 'Lovely', hidden: false });
    await PoojaReview.create({ bookingId: 'b2', uid: 'u4', poojaSlug: 'navratri', name: 'Ravi', rating: 2, text: 'Rude', hidden: true, edited: true, originalText: 'Ruder' });
    const intent = (key, kind, extra = {}) => ({ key, kind, uid: 'u1', amount: 100, status: 'pending', openedAt: old, attempts: 0, ...extra });
    intentKeys = { copied: [], stays: [] };
    const rows = [
      // the unfinished ones: a debit whose answer was lost, and refunds queued while the wallet was down
      intent('booking:u7:req-lost', 'booking', { type: 'booking_debit', refType: 'booking', requestId: 'req-lost', uid: 'u7', payload: { ...base(7), requestId: 'req-lost' } }),
      intent('chadhava:u8:req-lostc', 'chadhava', { type: 'chadhava_debit', refType: 'chadhava', requestId: 'req-lostc', uid: 'u8', payload: { uid: 'u8', requestId: 'req-lostc', listingSlug: 'pitru', listingTitle: 'Pitru', items: [{ key: 'flowers', title: 'Flowers', qty: 2, coins: 11 }], totalCoins: 22, cancelBy: null } }),
      intent(`booking:${(await Booking.findOne({ requestId: 'req-split-1' }))._id}:refund`, 'refund', { refType: 'booking', refId: 'b9', uid: 'u1', amount: 100 }), // queued by the monolith: no ofKey
      intent('chadhava:o1:refund', 'refund', { refType: 'chadhava', refId: 'o1', status: 'done' }),
      intent('booking:u3:req-done', 'booking', { status: 'done', requestId: 'req-done' }),
      intent('booking:u3:req-failed', 'booking', { status: 'failed' }),
      // the ones that stay: a call's queued refund
      intent('call:c1:refund:1', 'refund', { refType: 'call', refId: 'c1', amount: 4 }),
      intent('call:c2:refund:1', 'refund', { refType: 'call', refId: 'c2', amount: 4, status: 'done' }),
    ];
    for (const r of rows) await WalletIntent.create(r);
    intentKeys.copied = rows.filter((r) => r.kind !== 'refund' || ['booking', 'chadhava'].includes(r.refType)).map((r) => r.key).sort();
    intentKeys.stays = rows.filter((r) => r.refType === 'call').map((r) => r.key).sort();
    await M.disconnect();
  });

  test('the manifest names the REAL collections: the monolith\'s models wrote bookings / chadhavaorders / poojareviews / walletintents, the orders service reads the same three plus orderintents', async () => {
    assert.deepEqual(MANIFEST.orders.slice(0, 3), ['bookings', 'chadhavaorders', 'poojareviews']);
    assert.deepEqual(MANIFEST.orders[3].from, 'walletintents');
    assert.equal(MANIFEST.orders[3].to, 'orderintents');
    await import('../services/orders/src/models.js');
    const mine = Object.values(mongoose.models).map((m) => m.collection.name).filter((n) => ['bookings', 'chadhavaorders', 'poojareviews', 'orderintents'].includes(n));
    assert.deepEqual([...mine].sort(), [...COLLECTIONS].sort(), 'the orders service\'s models');
    if (haveMono) {
      const names = (await db(SRC).listCollections().toArray()).map((c) => c.name);
      for (const c of ['bookings', 'chadhavaorders', 'poojareviews', 'walletintents']) assert.ok(names.includes(c), `the monolith wrote ${c}`);
    }
    for (const other of ['settings', 'users', 'wallets', 'wallettxns', 'poojas', 'chadhavalistings']) assert.ok(!MANIFEST.orders.includes(other));
  });

  test('--dry-run counts the filtered intents and writes nothing', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['orders'], dryRun: true, log: quiet });
    const by = Object.fromEntries(rows.map((r) => [r.collection, r.source]));
    assert.deepEqual([by.bookings, by.chadhavaorders, by.poojareviews, by.orderintents], [520, 2, 2, intentKeys.copied.length]);
    assert.equal(rows.find((r) => r.collection === 'orderintents').from, 'walletintents');
    assert.deepEqual(await oCounts(), { bookings: 0, chadhavaorders: 0, poojareviews: 0, orderintents: 0 });
  });

  test('the real run copies every document with its _id and field order (batches of 500 included); intents are renamed and FILTERED - the call refunds stay behind; pending ones cross unfinished', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['orders'], log: quiet });
    assert.deepEqual(rows.map((r) => r.inserted), rows.map((r) => r.source));
    const after = await oCounts();
    assert.deepEqual([after.bookings, after.chadhavaorders, after.poojareviews], [520, 2, 2]);
    const b = await db(SRC).collection('bookings').findOne({ requestId: 'req-split-3' });
    const bc = await db('orders').collection('bookings').findOne({ requestId: 'req-split-3' });
    assert.deepEqual(bc, b);
    assert.deepEqual(Object.keys(bc), Object.keys(b), 'field order preserved');
    const legacy = await db('orders').collection('chadhavaorders').findOne({ ref: 'CHD-BBBBB' });
    assert.deepEqual([legacy.total, legacy.status, 'requestId' in legacy], [51, 'offered', false], 'an old row keeps its legacy fields');
    const r = await db('orders').collection('poojareviews').findOne({ bookingId: 'b2' });
    assert.deepEqual([r.hidden, r.edited, r.originalText], [true, true, 'Ruder'], 'moderation state survives');
    assert.deepEqual((await db('orders').collection('orderintents').find({}).toArray()).map((x) => x.key).sort(), intentKeys.copied);
    for (const k of intentKeys.stays) assert.equal(await db('orders').collection('orderintents').countDocuments({ key: k }), 0, `${k} is not orders'`);
    const pend = await db('orders').collection('orderintents').findOne({ key: 'booking:u7:req-lost' });
    const srcPend = await db(SRC).collection('walletintents').findOne({ key: 'booking:u7:req-lost' });
    assert.deepEqual(pend, srcPend);
    assert.equal(pend.status, 'pending', 'an unfinished intent crosses unfinished');
    assert.equal(await db(SRC).collection('walletintents').countDocuments(), 8, 'the source keeps every intent (copy-only)');
    assert.equal(await db('orders').collection('settings').countDocuments(), 0);
  });

  test('the orders service\'s sweeper resolves what crossed: the lost debit becomes its booking / order, the queued refunds are sent WITH the debit they reverse, the finished ones are left alone', { skip: !haveMono }, async () => {
    const { OrderIntent } = await import('../services/orders/src/models.js');
    const { Booking, ChadhavaOrder } = await import('../services/orders/src/models.js');
    const { sweep } = await import('../services/orders/src/modules/saga/index.js');
    await import('../services/orders/src/modules/bookings/bookings.service.js'); // registers the completers
    await import('../services/orders/src/modules/chadhava/chadhava.service.js');
    const { setContext } = await import('../services/orders/src/lib/context.js');
    const refunds = [];
    const posted = new Map([
      ['booking:u7:req-lost', { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'posted', balanceAfter: 900 }],
      ['chadhava:u8:req-lostc', { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', status: 'posted', balanceAfter: 800 }],
    ]);
    setContext({
      config: { intentMinAgeMs: 0, intentGraceMs: 120_000 },
      log: { info() {}, warn() {}, error() {} },
      wallet: {
        isUnavailable: () => false,
        txnByKey: async (key) => posted.get(key) ?? null,
        refund: async (args) => { refunds.push(args); return { txn: { _id: 'r' }, balance: 1 }; },
      },
    });
    await mongoose.connect(cluster, { dbName: 'orders' });
    try {
      await Promise.all([OrderIntent, Booking, ChadhavaOrder].map((m) => m.init()));
      const n = await Booking.countDocuments();
      const s = await sweep({ minAgeMs: 0 });
      assert.deepEqual([s.checked, s.done, s.failed, s.waiting], [3, 3, 0, 0], JSON.stringify(s));
      const made = await Booking.findOne({ requestId: 'req-lost' });
      assert.deepEqual([made.uid, made.walletTxnId, made.status, made.totalCoins], ['u7', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'booked', 100], 'the booking behind the lost answer was written');
      assert.equal(await Booking.countDocuments(), n + 1);
      const order = await ChadhavaOrder.findOne({ requestId: 'req-lostc' });
      assert.deepEqual([order.uid, order.walletTxnId, order.totalCoins], ['u8', 'bbbbbbbbbbbbbbbbbbbbbbbb', 22]);
      assert.equal(refunds.length, 1, 'one refund went out');
      assert.match(refunds[0].idempotencyKey, /^booking:[0-9a-f]{24}:refund$/);
      assert.equal(refunds[0].ofKey, 'booking:u1:req-split-1', 'the debit it reverses, derived from the booking the key names');
      assert.deepEqual((await OrderIntent.find({ status: 'pending' }).lean()).length, 0);
      assert.equal((await sweep({ minAgeMs: 0 })).checked, 0, 'idempotent');
    } finally {
      await mongoose.connection.close();
    }
  });

  test('a second run inserts nothing, an orders-side edit survives it, and the source is untouched', { skip: !haveMono }, async () => {
    const before = await oCounts();
    await db('orders').collection('poojareviews').updateOne({ bookingId: 'b1' }, { $set: { hidden: true } });
    const rows = await splitDb({ sourceUri, services: ['orders'], log: quiet });
    assert.ok(rows.every((r) => r.inserted === 0), JSON.stringify(rows));
    assert.deepEqual(await oCounts(), before);
    assert.equal((await db('orders').collection('poojareviews').findOne({ bookingId: 'b1' })).hidden, true);
    assert.equal((await db(SRC).collection('poojareviews').findOne({ bookingId: 'b1' })).hidden, false);
  });

  test('--overwrite refreshes an existing id from the source; every service can be split in one run', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['orders'], overwrite: true, log: quiet });
    assert.ok(rows.some((r) => r.replaced > 0));
    assert.equal((await db('orders').collection('poojareviews').findOne({ bookingId: 'b1' })).hidden, false);
    const all = await splitDb({ sourceUri, services: Object.keys(MANIFEST), dryRun: true, log: quiet });
    assert.equal(all.length, Object.values(MANIFEST).reduce((n, c) => n + c.length, 0));
  });
});

describe('split-db calls', () => {
  const COLLECTIONS = ['astrologers', 'callsessions', 'astrologerearnings', 'payouts', 'callintents'];
  const monoDir = fileURLToPath(new URL('../../pooja-api/src/', import.meta.url));
  const haveMono = existsSync(`${monoDir}modules/calls/call.model.js`);
  const cCounts = async () => Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await db('calls').collection(c).countDocuments()])));
  let M; // the monolith's mongoose
  let ids;
  const old = new Date(Date.now() - 3_600_000);

  before(async () => {
    if (!haveMono) return;
    try { await seedCalls(); } catch (e) { await M?.disconnect(); throw e; }
  });
  async function seedCalls() {
    // an earlier block left decoy rows in some of these; this one wants them clean
    for (const c of ['astrologers', 'callsessions', 'astrologerearnings', 'payouts', 'walletintents']) await db(SRC).collection(c).deleteMany({});
    // The source is written by the MONOLITH's own models (its own mongoose), so the data has exactly the shape production has.
    M = (await import(new URL('../../pooja-api/node_modules/mongoose/index.js', import.meta.url).href)).default;
    await M.connect(cluster, { dbName: SRC });
    const { Astrologer } = await import(`${monoDir}modules/astrologers/astrologer.model.js`);
    const { CallSession } = await import(`${monoDir}modules/calls/call.model.js`);
    const { AstrologerEarning, Payout } = await import(`${monoDir}modules/payouts/payout.model.js`);
    const { WalletIntent } = await import(`${monoDir}lib/wallet-saga.js`);
    await Promise.all([Astrologer, CallSession, AstrologerEarning, Payout, WalletIntent].map((m) => m.init()));
    // the monolith's own index on `devoteeLive` alone lets exactly ONE call be live at a time; the data it can have written is therefore a superset-safe input for the service
    const a1 = await Astrologer.create({ name: 'Pt. Sharma', ratePerMin: 10, platformSharePct: 30, signInEmail: 's@example.com', signInPhone: '+919000000001', uid: 'ast-1', status: 'active', presence: 'busy', lastSeenAt: old });
    const a2 = await Astrologer.create({ name: 'Invited One', ratePerMin: 8, signInEmail: 'i@example.com' }); // never signed in: no uid, no phone
    const call = (n, extra = {}) => ({ devoteeUid: `dev-${n}`, devoteeName: `Devotee ${n}`, astrologerId: a1._id, astrologerUid: 'ast-1', astrologerName: 'Pt. Sharma', requestId: `rq-${n}`, status: 'ended', endReason: 'completed', ratePerMinSnapshot: 10, shareSnapshot: 30, requestedAt: old, answeredAt: old, endedAt: old, minutesBilled: 2, coinsCharged: 20, rtcChannel: `call-${n}`, rating: 5, ...extra });
    ids = { calls: [] };
    for (let i = 0; i < 520; i++) ids.calls.push((await CallSession.create(call(i))).id);
    const live = await CallSession.create(call(900, { status: 'connected', endReason: undefined, endedAt: undefined, nextBillAt: new Date(Date.now() + 30_000), devoteeLive: true, astrologerLive: true, devoteeSeenAt: old }));
    ids.live = live.id;
    const failed = await CallSession.create(call(901, { endReason: 'failed', minutesBilled: 1, coinsCharged: 10, coinsRefunded: 10, rating: undefined }));
    ids.failed = failed.id;
    const goodwill = await CallSession.create(call(902, { coinsRefunded: 4, refunds: [{ requestId: 'rid-9', coins: 4, reason: 'echo', by: 'ops', at: old }] }));
    ids.goodwill = goodwill.id;
    for (let m = 1; m <= 2; m++) await AstrologerEarning.create({ astrologerId: a1._id, callId: goodwill._id, minute: m, coins: 7, paise: 700, at: old, ...(m === 2 ? { voidedAt: old } : {}) });
    await Payout.create({ astrologerId: a1._id, amountPaise: 500, reference: 'UTR1', recordedBy: 'ops', paidAt: old });
    ids.a1 = String(a1._id);
    ids.a2 = String(a2._id);
    const intent = (key, kind, extra = {}) => ({ key, kind, uid: 'dev-901', amount: 10, status: 'pending', openedAt: old, attempts: 0, ...extra });
    ids.intentRows = [
      // the unfinished ones the calls service must finish: a connect-failure refund the wallet never confirmed, and a goodwill refund queued while it was down
      intent(`call:${ids.failed}:refund:1`, 'refund', { refType: 'call', refId: ids.failed }), // queued by the monolith: no ofKey
      intent(`call:${ids.goodwill}:goodwill:rid-9`, 'refund', { refType: 'call', refId: ids.goodwill, uid: 'dev-902', amount: 4, note: 'echo', createdBy: 'ops' }),
      intent('call:cdone:refund:1', 'refund', { refType: 'call', refId: 'cdone', status: 'done' }),
      // the ones that are NOT the calls service's
      intent('booking:u7:req-lost', 'booking', { type: 'booking_debit', refType: 'booking', requestId: 'req-lost', uid: 'u7', payload: { totalCoins: 100 } }),
      intent('booking:b1:refund', 'refund', { refType: 'booking', refId: 'b1', amount: 100 }),
      intent('chadhava:o1:refund', 'refund', { refType: 'chadhava', refId: 'o1' }),
    ];
    for (const r of ids.intentRows) await WalletIntent.create(r);
    await M.disconnect();
  }

  test('the manifest names the REAL collections: the monolith\'s models wrote astrologers / callsessions / astrologerearnings / payouts / walletintents, the calls service reads the same four plus callintents', async () => {
    assert.deepEqual(MANIFEST.calls.slice(0, 4), ['astrologers', 'callsessions', 'astrologerearnings', 'payouts']);
    assert.deepEqual([MANIFEST.calls[4].from, MANIFEST.calls[4].to, MANIFEST.calls[4].filter], ['walletintents', 'callintents', { kind: 'refund', refType: 'call' }]);
    await import('../services/calls/src/models.js');
    const mine = Object.values(mongoose.models).map((m) => m.collection.name).filter((n) => COLLECTIONS.includes(n));
    assert.deepEqual([...mine].sort(), [...COLLECTIONS].sort(), 'the calls service\'s models');
    if (haveMono) {
      const names = (await db(SRC).listCollections().toArray()).map((c) => c.name);
      for (const c of ['astrologers', 'callsessions', 'astrologerearnings', 'payouts', 'walletintents']) assert.ok(names.includes(c), `the monolith wrote ${c}`);
    }
    for (const other of ['settings', 'users', 'wallets', 'wallettxns', 'bookings', 'orderintents']) assert.ok(!MANIFEST.calls.includes(other));
  });

  test('--dry-run counts the filtered intents and writes nothing', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['calls'], dryRun: true, log: quiet });
    const by = Object.fromEntries(rows.map((r) => [r.collection, r.source]));
    assert.deepEqual([by.astrologers, by.callsessions, by.astrologerearnings, by.payouts, by.callintents], [2, 523, 2, 1, 3]);
    assert.equal(rows.find((r) => r.collection === 'callintents').from, 'walletintents');
    assert.deepEqual(await cCounts(), { astrologers: 0, callsessions: 0, astrologerearnings: 0, payouts: 0, callintents: 0 });
  });

  test('the real run copies every document with its _id and field order (batches of 500 included); intents are renamed and FILTERED - the order intents stay behind; pending ones cross unfinished', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['calls'], log: quiet });
    assert.deepEqual(rows.map((r) => r.inserted), rows.map((r) => r.source));
    assert.deepEqual(await cCounts(), { astrologers: 2, callsessions: 523, astrologerearnings: 2, payouts: 1, callintents: 3 });
    for (const [coll, filter] of [['callsessions', { requestId: 'rq-3' }], ['callsessions', { requestId: 'rq-900' }], ['astrologers', { signInEmail: 'i@example.com' }], ['astrologers', { uid: 'ast-1' }], ['payouts', { reference: 'UTR1' }]]) {
      const src = await db(SRC).collection(coll).findOne(filter);
      const copy = await db('calls').collection(coll).findOne(filter);
      assert.deepEqual(copy, src, `${coll} ${JSON.stringify(filter)}`);
      assert.deepEqual(Object.keys(copy), Object.keys(src), `field order of ${coll}`);
    }
    const inv = await db('calls').collection('astrologers').findOne({ signInEmail: 'i@example.com' });
    assert.ok(!('uid' in inv) && !('signInPhone' in inv), 'an invite keeps its unset sparse-unique fields unset (never null)');
    const earn = await db('calls').collection('astrologerearnings').find({}).sort({ minute: 1 }).toArray();
    assert.deepEqual(earn.map((e) => [e.minute, 'voidedAt' in e]), [[1, false], [2, true]], 'voided earnings stay voided');
    assert.deepEqual((await db('calls').collection('callintents').find({}).toArray()).map((x) => x.key).sort(), ids.intentRows.filter((r) => r.refType === 'call').map((r) => r.key).sort());
    for (const k of ['booking:u7:req-lost', 'booking:b1:refund', 'chadhava:o1:refund']) assert.equal(await db('calls').collection('callintents').countDocuments({ key: k }), 0, `${k} is not the calls service's`);
    const pend = await db('calls').collection('callintents').findOne({ key: `call:${ids.failed}:refund:1` });
    assert.deepEqual(pend, await db(SRC).collection('walletintents').findOne({ key: `call:${ids.failed}:refund:1` }));
    assert.equal(pend.status, 'pending', 'an unfinished intent crosses unfinished');
    assert.equal(await db(SRC).collection('walletintents').countDocuments(), ids.intentRows.length, 'the source keeps every intent (copy-only)');
    assert.equal(await db('calls').collection('settings').countDocuments(), 0);
  });

  test('the calls service reads what crossed: its indexes build on the copied data, a connected call is still billable, and the unfinished refunds are resolved AFTER the cutover (ofKey derived; the goodwill one with its reason, under its own key)', { skip: !haveMono }, async () => {
    const { Astrologer, CallSession, CallIntent } = await import('../services/calls/src/models.js');
    const { sweep } = await import('../services/calls/src/modules/saga/index.js');
    const { billNextMinute } = await import('../services/calls/src/modules/calls/call.service.js');
    const { setContext } = await import('../services/calls/src/lib/context.js');
    const refunds = [];
    const debits = [];
    setContext({
      config: { intentMinAgeMs: 0 },
      log: { info() {}, warn() {}, error() {} },
      settings: { getNumber: async (k, fb) => (k === 'payoutPaisePerCoin' ? 100 : fb) },
      wallet: {
        isUnavailable: () => false,
        refund: async (args) => { refunds.push(args); return { txn: { _id: 'r' }, balance: 1 }; },
        debit: async (args) => { debits.push(args); return { txn: { _id: 'd' }, balance: 1 }; },
      },
    });
    await mongoose.connect(cluster, { dbName: 'calls' });
    try {
      await Promise.all(Object.values(mongoose.models).filter((m) => COLLECTIONS.includes(m.collection.name)).map((m) => m.init()));
      assert.equal(await Astrologer.countDocuments({ status: 'active' }), 1);
      const s = await sweep({ minAgeMs: 0 });
      assert.deepEqual([s.checked, s.done, s.failed, s.waiting], [2, 2, 0, 0], JSON.stringify(s));
      const byKey = Object.fromEntries(refunds.map((r) => [r.idempotencyKey, r]));
      assert.equal(byKey[`call:${ids.failed}:refund:1`].ofKey, `call:${ids.failed}:min:1`, 'the debit it reverses, derived from its key');
      assert.deepEqual([byKey[`call:${ids.goodwill}:goodwill:rid-9`].reason, byKey[`call:${ids.goodwill}:goodwill:rid-9`].ofKey], ['echo', undefined], 'the monolith\'s goodwill refund keeps its own key and its reason');
      assert.equal((await CallIntent.find({ status: 'pending' }).lean()).length, 0);
      assert.equal((await sweep({ minAgeMs: 0 })).checked, 0, 'idempotent');
      // the call that was connected when the monolith stopped is billed by the service: the next minute under the SAME key shape
      const live = await CallSession.findById(ids.live);
      assert.equal(live.status, 'connected');
      const r = await billNextMinute(live, new Date());
      assert.equal(r.call.minutesBilled, 3);
      assert.equal(debits[0].idempotencyKey, `call:${ids.live}:min:3`);
    } finally {
      await mongoose.connection.close();
    }
  });

  test('a second run inserts nothing, a calls-side edit survives it, and the source is untouched', { skip: !haveMono }, async () => {
    const before = await cCounts();
    await db('calls').collection('payouts').updateOne({ reference: 'UTR1' }, { $set: { amountPaise: 999 } });
    const rows = await splitDb({ sourceUri, services: ['calls'], log: quiet });
    assert.ok(rows.every((r) => r.inserted === 0), JSON.stringify(rows));
    assert.deepEqual(await cCounts(), before);
    assert.equal((await db('calls').collection('payouts').findOne({ reference: 'UTR1' })).amountPaise, 999);
    assert.equal((await db(SRC).collection('payouts').findOne({ reference: 'UTR1' })).amountPaise, 500);
    assert.equal(await db(SRC).collection('callsessions').countDocuments(), 523, 'copy-only');
  });

  test('--overwrite refreshes an existing id from the source; every service can be split in one run', { skip: !haveMono }, async () => {
    const rows = await splitDb({ sourceUri, services: ['calls'], overwrite: true, log: quiet });
    assert.ok(rows.some((r) => r.replaced > 0));
    assert.equal((await db('calls').collection('payouts').findOne({ reference: 'UTR1' })).amountPaise, 500);
    const all = await splitDb({ sourceUri, services: Object.keys(MANIFEST), dryRun: true, log: quiet });
    assert.equal(all.length, Object.values(MANIFEST).reduce((n, c) => n + c.length, 0));
  });
});
