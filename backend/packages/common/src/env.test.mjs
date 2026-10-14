import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadEnv, serviceUrl } from './env.js';

test('serviceUrl keeps a full URL and drops trailing slashes and spaces', () => {
  assert.equal(serviceUrl(' http://127.0.0.1:4060/ '), 'http://127.0.0.1:4060');
  assert.equal(serviceUrl('https://x.example.com//'), 'https://x.example.com');
});

test('serviceUrl turns the bare host Render passes into a URL', () => {
  // private service (fromService property: hostport): http, no dot
  assert.equal(serviceUrl('bhakti-wallet:10000'), 'http://bhakti-wallet:10000');
  assert.equal(serviceUrl('bhakti-wallet'), 'http://bhakti-wallet');
  // public web service (property: host): https
  assert.equal(serviceUrl('bhakti-wallet.onrender.com'), 'https://bhakti-wallet.onrender.com');
  // local forms
  assert.equal(serviceUrl('localhost:4060'), 'http://localhost:4060');
  assert.equal(serviceUrl('127.0.0.1:4060'), 'http://127.0.0.1:4060');
});

test('serviceUrl leaves "not set" empty and works as a loadEnv parser', () => {
  assert.equal(serviceUrl(''), '');
  assert.equal(serviceUrl(undefined), '');
  const c = loadEnv({ X_URL: 'bhakti-x:10000' }, { x: { name: 'X_URL', default: '', parse: serviceUrl }, y: { name: 'Y_URL', default: '', parse: serviceUrl } });
  assert.equal(c.x, 'http://bhakti-x:10000');
  assert.equal(c.y, '');
});
