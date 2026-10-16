import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MAP_STYLE, boundsOf, circleRing, cumulativeM, distanceLabel, formatCoords, haversineM, kmLabel, metresPerPixel, nearestOnPath, parseCoords, pathLengthKm, resolveStyleUrl, snapToPath } from './geo.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('haversine: known distances', () => {
  assert.equal(haversineM([19.076, 72.8777], [19.076, 72.8777]), 0);
  near(haversineM([0, 0], [0, 1]), 111195, 100); // one degree of longitude at the equator
  near(haversineM([19.076, 72.8777], [18.5204, 73.8567]), 119000, 2500); // Mumbai - Pune, about 120 km
  assert.equal(haversineM([10, 20], [11, 21]), haversineM([11, 21], [10, 20]));
});
test('path length sums the segments and ignores bad points', () => {
  assert.equal(pathLengthKm([]), 0);
  assert.equal(pathLengthKm([[1, 1]]), 0);
  const p = [[0, 0], [0, 1], [0, 2]];
  near(pathLengthKm(p), 222.39, 0.2);
  const c = cumulativeM(p);
  assert.equal(c[0], 0);
  near(c[2], 2 * c[1], 1);
  near(pathLengthKm([[0, 0], [NaN, 1], [0, 2]]), 222.39, 0.2);
});
test('nearest point on a path and the km along it', () => {
  const p = [[0, 0], [0, 1], [0, 2]]; // due east along the equator
  const n = nearestOnPath(p, [0.001, 1.5]);
  near(n.routeKm, 166.79, 0.3); // 1.5 degrees of longitude from the start
  near(n.distanceM, 111, 2);
  assert.equal(n.segment, 1);
  near(nearestOnPath(p, [0, -5]).routeKm, 0, 0.001); // beyond the start clamps to the start
  near(nearestOnPath(p, [0, 9]).routeKm, 222.39, 0.2); // beyond the end clamps to the end
  assert.equal(nearestOnPath([], [0, 0]), null);
  assert.equal(nearestOnPath([[3, 4]], [3, 4]).routeKm, 0);
});
test('the km of a vertex is the path distance to it', () => {
  const p = [[0, 0], [0, 1], [1, 1]];
  const n = nearestOnPath(p, [0, 1]);
  near(n.routeKm, haversineM(p[0], p[1]) / 1000, 0.01);
  near(nearestOnPath(p, [1, 1]).routeKm, pathLengthKm(p), 0.01);
});
test('snap lands on the path only when close enough', () => {
  const p = [[0, 0], [0, 1]];
  const hit = snapToPath(p, [0.0002, 0.5], 50);
  assert.equal(hit.snapped, true);
  assert.equal(hit.point[0], 0);
  const miss = snapToPath(p, [0.01, 0.5], 50);
  assert.equal(miss.snapped, false);
  assert.deepEqual(miss.point, [0.01, 0.5]);
  assert.ok(miss.routeKm > 0);
  assert.equal(snapToPath([], [1, 1], 50).snapped, false);
});
test('paste parsing', () => {
  assert.deepEqual(parseCoords('19.0760, 72.8777'), { lat: 19.076, lng: 72.8777 });
  assert.deepEqual(parseCoords('  19.0760,72.8777 '), { lat: 19.076, lng: 72.8777 });
  assert.deepEqual(parseCoords('19.076 72.8777'), { lat: 19.076, lng: 72.8777 });
  assert.deepEqual(parseCoords('(-33.86, 151.21)'), { lat: -33.86, lng: 151.21 });
  assert.deepEqual(parseCoords('19.076° N, 72.8777° E'), { lat: 19.076, lng: 72.8777 });
  assert.deepEqual(parseCoords('33.86 S, 151.21 W'), { lat: -33.86, lng: -151.21 });
  assert.deepEqual(parseCoords('https://www.google.com/maps/@19.0760,72.8777,15z'), { lat: 19.076, lng: 72.8777 });
  for (const bad of ['', 'abc', '19.07', '19.07, 72.8, 1', '91, 10', '10, 181', '1,2,3', null, undefined, 'N, E']) assert.equal(parseCoords(bad), null, String(bad));
  assert.equal(formatCoords(19.076, 72.8777), '19.07600, 72.87770');
  assert.equal(formatCoords(NaN, 1), '');
});
test('circle ring is closed and radius-true', () => {
  const ring = circleRing([19, 72], 500, 16);
  assert.equal(ring.length, 17);
  assert.deepEqual(ring[0], ring[16]);
  for (const [lng, lat] of ring) near(haversineM([19, 72], [lat, lng]), 500, 3);
});
test('bounds, labels, scale', () => {
  assert.deepEqual(boundsOf([[1, 2], [3, 0]]), [[0, 1], [2, 3]]);
  assert.equal(boundsOf([]), null);
  assert.equal(distanceLabel(420), '420 m');
  assert.equal(distanceLabel(1500), '1.50 km');
  assert.equal(distanceLabel(null), '—');
  assert.equal(kmLabel(12.44), '12.4 km');
  assert.equal(kmLabel(0), '0.0 km');
  near(metresPerPixel(0, 0), 78271.5, 1);
});
test('the map style never falls to the OSM volunteer tile servers', () => {
  assert.equal(resolveStyleUrl(undefined), DEFAULT_MAP_STYLE);
  assert.equal(resolveStyleUrl('  '), DEFAULT_MAP_STYLE);
  assert.equal(resolveStyleUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), DEFAULT_MAP_STYLE);
  assert.equal(resolveStyleUrl('https://example.org/style.json'), 'https://example.org/style.json');
  assert.match(DEFAULT_MAP_STYLE, /tiles\.openfreemap\.org\/styles\/liberty$/);
});
