// ONE list of money-moving setting keys: @bhakti/common's MONEY_SETTING_KEYS. The wallet's billing-rules screen and the
// monolith's carry their own RULES (with bounds); this fails the day any key set drifts from the shared list.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MONEY_SETTING_KEYS } from '@bhakti/common';

import { MONEY_KEYS } from '../services/engagement/src/defaults.js';

const sorted = (a) => [...a].sort();
const wallet = new URL('../services/wallet/src/modules/coins/billing-rules.routes.js', import.meta.url);
const mono = new URL('../../pooja-api/src/modules/coins/billing-rules.routes.js', import.meta.url);

test('engagement guards exactly the shared money keys', () => {
  assert.deepEqual(sorted(MONEY_KEYS), sorted(MONEY_SETTING_KEYS));
  assert.equal(new Set(MONEY_SETTING_KEYS).size, MONEY_SETTING_KEYS.length, 'no duplicates');
  assert.ok(Object.isFrozen(MONEY_SETTING_KEYS));
});

test('the wallet service billing rules are exactly the shared money keys', async () => {
  const { RULE_KEYS } = await import(wallet);
  assert.deepEqual(sorted(RULE_KEYS), sorted(MONEY_SETTING_KEYS));
});

test('the monolith billing rules are exactly the shared money keys', { skip: !existsSync(fileURLToPath(mono)) && 'pooja-api not checked out next to backend/' }, async () => {
  const { RULE_KEYS } = await import(mono);
  assert.deepEqual(sorted(RULE_KEYS), sorted(MONEY_SETTING_KEYS));
});
