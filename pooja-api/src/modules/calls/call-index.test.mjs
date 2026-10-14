import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import mongoose from 'mongoose';

import { CallSession, dropStaleDevoteeLiveIndex } from './call.model.js';

const URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27118/call_index_test';
const row = (devoteeUid, n) => ({ devoteeUid, astrologerId: new mongoose.Types.ObjectId(), astrologerUid: `a${n}`, status: 'connected', devoteeLive: true, astrologerLive: true, requestId: `r${n}-${devoteeUid}`, rtcChannel: `call-${n}`, requestedAt: new Date(), shareSnapshot: 30, ratePerMinSnapshot: 10 });

before(async () => {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('two different devotees can be on live calls at the same time; one devotee cannot be on two', async () => {
  await CallSession.init();
  await CallSession.create(row('devotee-1', 1));
  await CallSession.create(row('devotee-2', 2)); // used to fail with E11000 on the platform-wide index
  await assert.rejects(CallSession.create(row('devotee-1', 3)), (e) => e.code === 11000);
});

test('a database that still has the old platform-wide index is repaired by the boot migration, and re-running is a no-op', async () => {
  await CallSession.deleteMany({});
  await CallSession.collection.dropIndexes();
  await CallSession.collection.createIndex({ devoteeLive: 1 }, { unique: true, partialFilterExpression: { devoteeLive: true }, name: 'devoteeLive_1' });
  await CallSession.collection.insertOne({ ...row('d-a', 4), createdAt: new Date() });
  await assert.rejects(CallSession.collection.insertOne({ ...row('d-b', 5), createdAt: new Date() }), (e) => e.code === 11000); // the bug, reproduced
  assert.equal(await dropStaleDevoteeLiveIndex(), true);
  await CallSession.collection.insertOne({ ...row('d-b', 5), createdAt: new Date() }); // fixed
  assert.equal(await dropStaleDevoteeLiveIndex(), false); // already gone: a quiet no-op
});
