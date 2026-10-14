import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadConfig } from './config.js';

test('bare Render hosts become URLs (private services: http, public: https)', () => {
  const base = { INTERNAL_JWT_SECRET: 'x'.repeat(20) };
  const c = loadConfig({ ...base, ENGAGEMENT_URL: 'bhakti-engagement:10000', IDENTITY_URL: 'bhakti-identity.onrender.com' });
  assert.equal(c.engagementUrl, 'http://bhakti-engagement:10000');
  assert.equal(c.identityUrl, 'https://bhakti-identity.onrender.com');
});

test('a required URL that is missing is still refused', () => {
  assert.throws(() => loadConfig({ INTERNAL_JWT_SECRET: 'x'.repeat(20), ENGAGEMENT_URL: 'e:1' }), /IDENTITY_URL/);
});
