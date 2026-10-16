// Run: node --test --test-concurrency=1 src/config.test.mjs   (no database)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { loadConfig } from './config.js';

const need = { INTERNAL_JWT_SECRET: 'test-secret-test-secret-1234' };
const read = (f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');

test('the defaults: wallet / identity unset, a 15 s sweeper, wallet and identity are allowed callers', () => {
  const c = loadConfig(need);
  assert.deepEqual([c.walletUrl, c.identityUrl, c.sessionSecret, c.sweepEveryMs, c.port], ['', '', '', 15000, 4090]);
  assert.ok(c.allowedIssuers.includes('mobile-bff') && c.allowedIssuers.includes('admin-bff'));
});
test('WALLET_URL / IDENTITY_URL are normalised; SWEEP_EVERY_MS=0 turns the sweeper off', () => {
  const c = loadConfig({ ...need, WALLET_URL: 'wallet-host:4060', IDENTITY_URL: 'http://id:4040/', SWEEP_EVERY_MS: '0', ADMIN_SESSION_SECRET: 's' });
  assert.deepEqual([c.walletUrl, c.identityUrl, c.sweepEveryMs, c.sessionSecret], ['http://wallet-host:4060', 'http://id:4040', 0, 's']);
});
test('.env.example lists exactly the variables config.js reads', () => {
  const used = new Set([...read('./config.js').matchAll(/(?:name: '|env\.)([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
  const listed = new Set([...read('../.env.example').matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), [...listed].sort());
});
