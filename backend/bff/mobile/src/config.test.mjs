import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadConfig } from './config.js';

// Render's `fromService` hands a blueprint a BARE host. The config turns it into a URL (see serviceUrl in @bhakti/common).
test('bare Render hosts become URLs, full URLs are untouched', () => {
  const c = loadConfig({
    INTERNAL_JWT_SECRET: 'x'.repeat(20),
    MONOLITH_URL: 'pooja-api.onrender.com',
    ENGAGEMENT_URL: 'bhakti-engagement:10000',
    IDENTITY_URL: 'http://127.0.0.1:4040/',
    CATALOG_URL: 'bhakti-catalog:10000',
    WALLET_URL: 'bhakti-wallet:10000',
    ORDERS_URL: 'bhakti-orders:10000',
    CALLS_URL: 'bhakti-calls:10000',
  });
  assert.equal(c.monolithUrl, 'https://pooja-api.onrender.com');
  assert.equal(c.engagementUrl, 'http://bhakti-engagement:10000');
  assert.equal(c.identityUrl, 'http://127.0.0.1:4040');
  assert.equal(c.callsUrl, 'http://bhakti-calls:10000');
});

test('unset URLs stay empty (the switch is "unset")', () => {
  const c = loadConfig({});
  assert.equal(c.walletUrl, '');
  assert.equal(c.monolithUrl, 'http://127.0.0.1:4000');
});

test('EVENTS_URL is normalised, optional, and needs the shared secret', () => {
  const c = loadConfig({ INTERNAL_JWT_SECRET: 'x'.repeat(20), EVENTS_URL: 'bhakti-events:10000' });
  assert.equal(c.eventsUrl, 'http://bhakti-events:10000');
  assert.equal(loadConfig({}).eventsUrl, '');
  assert.throws(() => loadConfig({ EVENTS_URL: 'http://127.0.0.1:4090' }), /INTERNAL_JWT_SECRET/);
});
