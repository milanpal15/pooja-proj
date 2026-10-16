// Pure geometry (no database): haversine, nearest point on a polyline with the km along the path.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { haversineM, nearestOnPath, pathLengthKm, round } from './lib/geo.js';

describe('haversineM', () => {
  test('zero for the same point; symmetric', () => {
    assert.equal(haversineM([19, 72], [19, 72]), 0);
    assert.equal(haversineM([19, 72], [20, 73]), haversineM([20, 73], [19, 72]));
  });
  test('one degree of latitude is ~111.2 km; Delhi to Mumbai is ~1148 km', () => {
    assert.ok(Math.abs(haversineM([0, 0], [1, 0]) - 111_195) < 50);
    const d = haversineM([28.6139, 77.209], [19.076, 72.8777]) / 1000;
    assert.ok(d > 1140 && d < 1160, String(d));
  });
  test('across the antimeridian and the poles stays finite and small', () => {
    assert.ok(haversineM([0, 179.9999], [0, -179.9999]) < 50);
    assert.ok(Number.isFinite(haversineM([90, 0], [-90, 0])));
  });
});

describe('nearestOnPath', () => {
  const path = [[19, 72], [19, 73], [20, 73]]; // east ~105 km, then north ~111 km
  const leg1 = haversineM(path[0], path[1]) / 1000;
  test('a point on the path has distance ~0 and the km walked to it', () => {
    const r = nearestOnPath(path, [19, 72.5]);
    assert.ok(r.distanceM < 1);
    assert.ok(Math.abs(r.routeKm - leg1 / 2) < 0.01);
    assert.equal(r.segment, 0);
  });
  test('a point beside the path projects onto the segment and measures the perpendicular', () => {
    const r = nearestOnPath(path, [19.01, 72.5]); // ~1.1 km north of the first leg
    assert.ok(Math.abs(r.distanceM - 1112) < 15, String(r.distanceM));
    assert.ok(Math.abs(r.routeKm - leg1 / 2) < 0.05);
  });
  test('beyond an end it clamps to that end', () => {
    const before = nearestOnPath(path, [19, 71.9]);
    assert.equal(before.routeKm, 0);
    assert.ok(before.distanceM > 10_000);
    const after = nearestOnPath(path, [20.2, 73]);
    assert.ok(Math.abs(after.routeKm - pathLengthKm(path)) < 1e-6);
  });
  test('on the second leg the km include the whole first leg', () => {
    const r = nearestOnPath(path, [19.5, 73]);
    assert.equal(r.segment, 1);
    assert.ok(Math.abs(r.routeKm - (leg1 + haversineM([19, 73], [19.5, 73]) / 1000)) < 0.01);
  });
  test('the nearer of two passes wins (a path that doubles back)', () => {
    const loop = [[19, 72], [19, 73], [19.01, 73], [19.01, 72]];
    const r = nearestOnPath(loop, [19.0099, 72.5]);
    assert.equal(r.segment, 2);
    assert.ok(r.routeKm > leg1);
  });
  test('degenerate inputs', () => {
    assert.equal(nearestOnPath([], [1, 1]), null);
    assert.equal(nearestOnPath([[1, 1]], [1, 1]).routeKm, 0);
    assert.equal(nearestOnPath([[1, 1], [1, 1]], [1, 1]).distanceM, 0); // a zero-length segment
  });
});

describe('pathLengthKm / round', () => {
  test('sums the legs', () => {
    assert.equal(pathLengthKm([[19, 72]]), 0);
    assert.ok(Math.abs(pathLengthKm([[0, 0], [1, 0], [2, 0]]) - 222.39) < 0.1);
  });
  test('round', () => {
    assert.equal(round(1.23456, 3), 1.235);
    assert.equal(round(1234, 0), 1234);
  });
});
