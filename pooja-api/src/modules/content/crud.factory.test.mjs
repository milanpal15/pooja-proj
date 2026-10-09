// The generic content CRUD: failure behaviour an operator actually sees.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import express from 'express';
import mongoose from 'mongoose';

import { crud, writeFailure } from './crud.factory.js';

const URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27117/crud_factory_test';

const Thing = mongoose.model(
  'CrudFactoryThing',
  new mongoose.Schema({ slug: { type: String, required: true, unique: true }, name: String, order: Number }),
);

let server;
let base;

before(async () => {
  await mongoose.connect(URI);
  await Thing.deleteMany({});
  await Thing.init();
  const app = express();
  app.use(express.json());
  app.use('/things', crud('Thing', Thing));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/things`;
});

after(async () => {
  await Thing.deleteMany({});
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

test('create, update and delete still work', async () => {
  const made = await call('POST', '', { slug: 'a', name: 'A' });
  assert.equal(made.status, 201);
  const put = await call('PUT', `/${made.body._id}`, { name: 'A2' });
  assert.equal(put.status, 200);
  assert.equal(put.body.name, 'A2');
  assert.equal((await call('DELETE', `/${made.body._id}`)).status, 200);
});

test('a malformed id is a 400, not a 500', async () => {
  const put = await call('PUT', '/not-an-id', { name: 'x' });
  assert.equal(put.status, 400);
  assert.match(put.body.error, /not valid/i);
  assert.equal((await call('DELETE', '/not-an-id')).status, 400);
});

test('an unknown but well-formed id is still a 404 on update', async () => {
  const res = await call('PUT', `/${new mongoose.Types.ObjectId()}`, { name: 'x' });
  assert.equal(res.status, 404);
});

test('a duplicate is a plain sentence that does not leak the index', async () => {
  await call('POST', '', { slug: 'dup', name: 'one' });
  const again = await call('POST', '', { slug: 'dup', name: 'two' });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /already uses that slug/i);
  assert.doesNotMatch(again.body.error, /E11000|collection|index/i);

  const other = await call('POST', '', { slug: 'other', name: 'three' });
  const clash = await call('PUT', `/${other.body._id}`, { slug: 'dup' });
  assert.equal(clash.status, 409, 'renaming onto an existing slug is a conflict, not a 500');
});

test('a missing required field names the field', async () => {
  const res = await call('POST', '', { name: 'no slug' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /slug/i);
});

test('writeFailure never echoes an unknown error verbatim', () => {
  const out = writeFailure(new Error('connection string mongodb://secret@host failed'));
  assert.equal(out.status, 400);
  assert.doesNotMatch(out.error, /secret|mongodb/);
});
