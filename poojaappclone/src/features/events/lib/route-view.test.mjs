/**
 *   node --test src/features/events/lib/route-view.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTs } from './load-ts.mjs';

const V = loadTs(path.join(path.dirname(fileURLToPath(import.meta.url)), 'route-view.ts'));

test('banner is a map only with a route, a native module and no failure', () => {
  assert.equal(V.bannerMode({ hasRoute: true, mapAvailable: true, mapFailed: false }), 'map');
  assert.equal(V.bannerMode({ hasRoute: false, mapAvailable: true, mapFailed: false }), 'cover');
  assert.equal(V.bannerMode({ hasRoute: true, mapAvailable: false, mapFailed: false }), 'cover');
  assert.equal(V.bannerMode({ hasRoute: true, mapAvailable: true, mapFailed: true }), 'cover');
});

test('exactly one view hosts the map', () => {
  assert.equal(V.mapHost({ mode: 'map', fullscreenOpen: false }), 'banner');
  assert.equal(V.mapHost({ mode: 'map', fullscreenOpen: true }), 'fullscreen');
  assert.equal(V.mapHost({ mode: 'cover', fullscreenOpen: true }), 'none');
});

test('full screen closes by itself when the map is gone', () => {
  assert.equal(V.fullscreenOpen(true, 'map'), true);
  assert.equal(V.fullscreenOpen(true, 'cover'), false);
  assert.equal(V.fullscreenOpen(false, 'map'), false);
});
