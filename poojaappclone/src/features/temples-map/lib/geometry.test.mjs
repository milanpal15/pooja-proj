/** node --test src/features/temples-map/lib/geometry.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTs } from './load-ts.mjs';

const g = loadTs('geometry');

test('hasCoords rejects unset (0,0), NaN, out of range and missing', () => {
  assert.equal(g.hasCoords({ lat: 0, lng: 0 }), false);
  assert.equal(g.hasCoords({ lat: NaN, lng: 5 }), false);
  assert.equal(g.hasCoords({ lat: 91, lng: 5 }), false);
  assert.equal(g.hasCoords({ lat: 5, lng: 181 }), false);
  assert.equal(g.hasCoords(null), false);
  assert.equal(g.hasCoords({ lat: '5', lng: 5 }), false);
  assert.equal(g.hasCoords({ lat: 25.31, lng: 83.01 }), true);
  assert.equal(g.hasCoords({ lat: 0, lng: 10 }), true);
});

test('haversineM: Delhi to Agra is about 178 km, and a point to itself is 0', () => {
  const d = g.haversineM({ lat: 28.6139, lng: 77.209 }, { lat: 27.1767, lng: 78.0081 });
  assert.ok(d > 170_000 && d < 185_000, String(d));
  assert.equal(g.haversineM({ lat: 10, lng: 10 }, { lat: 10, lng: 10 }), 0);
});

test('boundsOf fits points, ignores unset ones, and grows a single point to the minimum span', () => {
  const b = g.boundsOf([
    { lat: 25.3, lng: 83.0 },
    { lat: 19.0, lng: 72.8 },
    { lat: 0, lng: 0 },
  ]);
  assert.deepEqual(b, [72.8, 19.0, 83.0, 25.3]);

  const one = g.boundsOf([{ lat: 19, lng: 72.8 }], 0.05);
  assert.ok(Math.abs(one[2] - one[0] - 0.05) < 1e-9);
  assert.ok(Math.abs(one[3] - one[1] - 0.05) < 1e-9);
  assert.ok(Math.abs((one[0] + one[2]) / 2 - 72.8) < 1e-9);

  assert.equal(g.boundsOf([]), null);
  assert.equal(g.boundsOf([{ lat: 0, lng: 0 }]), null);
});

test('radiusForBounds uses the shorter half-side and clamps', () => {
  // ~0.18 deg tall at the equator => ~20 km tall => ~10 km radius
  const r = g.radiusForBounds([77.0, 28.0, 77.3, 28.18]);
  assert.ok(r > 8000 && r < 10_500, String(r));
  assert.equal(g.radiusForBounds([77, 28, 77.0001, 28.0001]), 500);
  assert.equal(g.radiusForBounds([60, 5, 100, 40]), 25_000);
  assert.equal(g.radiusForBounds([NaN, 0, 1, 1]), 500);
});

test('movedFarEnough: pans, zoom-out, never zoom-in', () => {
  const last = { lat: 19.0, lng: 72.8, radius: 8000 };
  assert.equal(g.movedFarEnough(null, last), true);
  assert.equal(g.movedFarEnough(last, { ...last, lat: 19.005 }), false); // ~550 m
  assert.equal(g.movedFarEnough(last, { ...last, lat: 19.02 }), false); // ~2.2 km < 35% of 8 km
  assert.equal(g.movedFarEnough(last, { ...last, lat: 19.03 }), true); // ~3.3 km
  assert.equal(g.movedFarEnough(last, { ...last, radius: 3000 }), false); // zoomed in
  assert.equal(g.movedFarEnough(last, { ...last, radius: 15_000 }), true); // zoomed far out
  // a small last search still needs at least 800 m
  const small = { lat: 19, lng: 72.8, radius: 1000 };
  assert.equal(g.movedFarEnough(small, { ...small, lat: 19.005 }), false);
  assert.equal(g.movedFarEnough(small, { ...small, lat: 19.01 }), true);
});

test('shouldOfferSearch needs a settled view that is zoomed in enough and has moved', () => {
  const last = { lat: 19.0, lng: 72.8, radius: 8000 };
  const view = { lat: 19.1, lng: 72.8, radius: 3000, zoom: 12 };
  assert.equal(g.shouldOfferSearch(last, null), false);
  assert.equal(g.shouldOfferSearch(last, { ...view, zoom: 6 }), false);
  assert.equal(g.shouldOfferSearch(last, view), true);
  assert.equal(g.shouldOfferSearch(last, { ...view, lat: 19.0 }), false);
  assert.equal(g.shouldOfferSearch(null, view), true); // never searched yet
  assert.equal(g.shouldOfferSearch(null, { ...view, zoom: 5 }), false);
});
