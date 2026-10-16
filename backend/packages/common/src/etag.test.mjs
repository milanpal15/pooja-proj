import assert from 'node:assert/strict';
import { test } from 'node:test';

import { etagMatches, jsonEtag } from './etag.js';

test('jsonEtag is a stable weak tag over the body', () => {
  assert.match(jsonEtag({ a: 1 }), /^W\/"[0-9a-f]{20}"$/);
  assert.equal(jsonEtag({ a: 1 }), jsonEtag({ a: 1 }));
  assert.notEqual(jsonEtag({ a: 1 }), jsonEtag({ a: 2 }));
});

test('etagMatches: weak comparison, lists, *, and nothing', () => {
  const t = jsonEtag([1]);
  assert.ok(etagMatches(t, t));
  assert.ok(etagMatches(t.slice(2), t), 'strong form of the same tag');
  assert.ok(etagMatches(`"x", ${t} ,"y"`, t));
  assert.ok(etagMatches('*', t));
  assert.ok(!etagMatches('W/"other"', t));
  assert.ok(!etagMatches('', t));
  assert.ok(!etagMatches(undefined, t));
});
