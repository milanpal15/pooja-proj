import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONTENT_KEYS, FALLBACK_SETTINGS, assembleContent, createEngagementReaders } from './catalog-content.js';

test('assembleContent: only the documented keys, in the monolith\'s order, settings then announcement last', () => {
  const bundle = Object.fromEntries([...CONTENT_KEYS].reverse().map((k) => [k, [k]]));
  const out = assembleContent({ ...bundle, extra: 1 }, { a: '1' }, null);
  assert.deepEqual(Object.keys(out), [...CONTENT_KEYS, 'settings', 'announcement']);
  assert.equal(JSON.stringify(out).includes('extra'), false);
  assert.deepEqual(out.settings, { a: '1' });
  assert.equal(out.announcement, null);
});

test('engagement readers: cached, stale on error, then the documented defaults; never throw', async () => {
  let calls = 0;
  let down = false;
  const client = { get: async (path) => { calls++; if (down) throw new Error('down'); return path.endsWith('/map') ? { settings: { prasadDelivery: '5' } } : { announcement: { title: 't' } }; } };
  const r = createEngagementReaders(client);
  assert.deepEqual(await r.settings(), { prasadDelivery: '5' });
  assert.deepEqual(await r.settings(), { prasadDelivery: '5' });
  assert.equal(calls, 1, 'cached');
  assert.deepEqual(await r.announcement(), { title: 't' });

  const cold = createEngagementReaders({ get: async () => { throw new Error('down'); } });
  assert.deepEqual(await cold.settings(), { ...FALLBACK_SETTINGS });
  assert.equal(await cold.announcement(), null);

  const real = Date.now;
  try {
    down = true;
    Date.now = () => real() + 60_000;
    assert.deepEqual(await r.settings(), { prasadDelivery: '5' }, 'the last good value outlives the outage');
  } finally {
    Date.now = real;
  }
});

test('FALLBACK_SETTINGS are the values the monolith uses', () => {
  assert.equal(FALLBACK_SETTINGS.prasadDelivery, '99');
});
