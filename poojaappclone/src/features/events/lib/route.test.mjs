/**
 *   node --test src/features/events/lib/route.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTs } from './load-ts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const R = loadTs(path.join(here, 'route.ts'));
const G = loadTs(path.join(here, 'route-geojson.ts'));

// A short east-west path near Ujjain, ~1.1 km per 0.01 deg of longitude at this latitude.
const PATH = [
  [23.18, 75.77],
  [23.18, 75.78],
  [23.18, 75.79],
  [23.18, 75.8],
];
const stop = (o) => ({ milestoneKey: 'm' + o.order, taskKey: 't', title: 's', name: 'Stop ' + o.order, lat: 23.18, lng: 75.77 + o.order * 0.01, radiusM: 150, routeKm: o.order, done: false, locked: false, ...o });

test('stop states: done / locked / first open is next, the rest open', () => {
  const out = R.resolveStops([stop({ order: 3 }), stop({ order: 1, done: true }), stop({ order: 2, locked: true }), stop({ order: 4 }), stop({ order: 5 })]);
  assert.deepEqual(out.map((s) => [s.order, s.state]), [[1, 'done'], [2, 'locked'], [3, 'next'], [4, 'open'], [5, 'open']]);
  assert.equal(R.nextStop(out).order, 3);
  assert.deepEqual(R.openStops(out).map((s) => s.order), [3, 4, 5]);
});

test('server `state` is ignored; no open stop means no next; unplaceable stops are dropped', () => {
  const out = R.resolveStops([stop({ order: 1, done: true, state: 'next' }), stop({ order: 2, lat: NaN })]);
  assert.equal(out.length, 1);
  assert.equal(R.nextStop(out), null);
  assert.deepEqual(R.resolveStops(null), []);
});

test('canCheckIn: radius plus min(accuracy, 50)', () => {
  assert.equal(R.canCheckIn(140, 150, 10), true);
  assert.equal(R.canCheckIn(190, 150, 80), true); // slack capped at 50 -> 200
  assert.equal(R.canCheckIn(210, 150, 80), false);
  assert.equal(R.canCheckIn(160, 150, undefined), false);
  assert.equal(R.canCheckIn(null, 150, 10), false);
});

test('distance label (shared formatter)', () => {
  const { formatDistance } = loadTs(path.join(here, '../../../components/map/distance.ts'));
  assert.equal(formatDistance(420), '420 m');
  assert.equal(formatDistance(1200), '1.2 km');
});

test('progress line', () => {
  const tpl = '{done} of {total} km · {stops} of {stopsTotal} stops';
  assert.equal(R.progressLine({ doneKm: 12.4, totalKm: 31, stopsDone: 3, stopsTotal: 7 }, tpl), '12.4 of 31 km · 3 of 7 stops');
  assert.equal(R.progressLine({ doneKm: 0, totalKm: 31.04, stopsDone: 0, stopsTotal: 7 }, tpl), '0 of 31 km · 0 of 7 stops');
  assert.equal(R.progressLine(null, tpl), '');
  assert.equal(R.progressRatio({ doneKm: 15.5, totalKm: 31, stopsDone: 1, stopsTotal: 2 }), 0.5);
  assert.equal(R.progressRatio({ doneKm: 5, totalKm: 0, stopsDone: 0, stopsTotal: 0 }), 0);
});

test('splitPath: at the start, in the middle (interpolated, shared point), and past the end', () => {
  assert.deepEqual(R.splitPath(PATH, 0).done, []);
  assert.equal(R.splitPath(PATH, 0).rest.length, 4);
  const total = 3 * 1.0242; // ~3 segments of 0.01 deg at lat 23.18
  const all = R.splitPath(PATH, 99);
  assert.equal(all.done.length, 4);
  assert.deepEqual(all.rest, []);
  const mid = R.splitPath(PATH, 1.5 * 1.0242);
  assert.equal(mid.done.length, 3); // p0, p1, split
  assert.equal(mid.rest.length, 3); // split, p2, p3
  assert.deepEqual(mid.done[2], mid.rest[0]);
  assert.ok(Math.abs(mid.done[2][0] - 75.785) < 0.0005);
  assert.ok(total > 3);
  // GeoJSON order is [lng, lat]
  assert.equal(mid.done[0][0], 75.77);
  assert.equal(mid.done[0][1], 23.18);
});

test('auto check-in decision: inside radius, good fix, once per stop', () => {
  const stops = R.resolveStops([stop({ order: 1 }), stop({ order: 2 })]);
  const s1 = stops[0];
  const fix = (o = {}) => ({ lat: s1.lat, lng: s1.lng + 0.0005, accuracyM: 20, mocked: false, ...o }); // ~51 m away
  const base = { enabled: true, fix: fix(), stops, reported: new Set(), triedAt: {}, now: 1_000_000 };
  assert.equal(R.autoCheckInTarget(base).order, 1);
  assert.equal(R.autoCheckInTarget({ ...base, enabled: false }), null);
  assert.equal(R.autoCheckInTarget({ ...base, fix: fix({ accuracyM: 150 }) }), null, 'weak fix');
  assert.equal(R.autoCheckInTarget({ ...base, fix: fix({ accuracyM: null }) }), null, 'unknown accuracy');
  assert.equal(R.autoCheckInTarget({ ...base, fix: fix({ mocked: true }) }), null, 'mocked');
  assert.equal(R.autoCheckInTarget({ ...base, fix: fix({ lng: s1.lng + 0.005 }) }), null, 'outside the radius (no slack)');
  assert.equal(R.autoCheckInTarget({ ...base, reported: new Set([R.stopKey(s1)]) }), null, 'already reported');
  assert.equal(R.autoCheckInTarget({ ...base, triedAt: { [R.stopKey(s1)]: base.now - 5_000 } }), null, 'tried a moment ago');
  assert.equal(R.autoCheckInTarget({ ...base, triedAt: { [R.stopKey(s1)]: base.now - 25_000 } }).order, 1, 'retry after the cooldown');
  const locked = R.resolveStops([stop({ order: 1, locked: true })]);
  assert.equal(R.autoCheckInTarget({ ...base, stops: locked }), null, 'locked stop');
  // nearest of several open stops inside their radii
  const two = R.resolveStops([stop({ order: 1, lng: 75.77, radiusM: 500 }), stop({ order: 2, lng: 75.7725, radiusM: 500 })]);
  assert.equal(R.autoCheckInTarget({ ...base, stops: two, fix: { lat: 23.18, lng: 75.7722, accuracyM: 10 } }).order, 2);
});

test('report body from a position', () => {
  const r = R.reportFromPosition({ coords: { latitude: 23.18, longitude: 75.77, accuracy: 12.6 }, timestamp: Date.UTC(2026, 9, 16, 5, 0, 0), mocked: false });
  assert.deepEqual(r, { lat: 23.18, lng: 75.77, accuracyM: 13, mocked: false, at: '2026-10-16T05:00:00.000Z' });
  assert.equal(R.reportFromPosition({ coords: { latitude: 1, longitude: 2, accuracy: null }, timestamp: 0, mocked: true }).mocked, true);
  assert.equal('accuracyM' in R.reportFromPosition({ coords: { latitude: 1, longitude: 2, accuracy: null } }), false);
});

test('error mapping', () => {
  const far = R.locationFailure(422, 'too_far', { distanceM: 420, radiusM: 150 }, 'en');
  assert.equal(far.key, 'ev_loc_too_far');
  assert.deepEqual(far.vars, { distance: '420 m', radius: '150 m' });
  assert.equal(R.locationFailure(422, 'too_far', { distanceM: 1200, radiusM: 150 }, 'hi').vars.distance, '1.2 कि.मी.');
  assert.equal(R.locationFailure(422, 'weak_fix', { accuracyM: 300, maxM: 100 }, 'en').key, 'ev_loc_weak');
  const mock = R.locationFailure(422, 'mock_location', {}, 'en');
  assert.equal(mock.key, 'ev_loc_mock');
  assert.equal(mock.final, true);
  assert.equal(R.locationFailure(409, 'implausible_move', {}, 'en').key, 'ev_loc_implausible');
  assert.equal(R.locationFailure(429, 'too_fast', {}, 'en').key, 'ev_loc_too_fast');
  assert.equal(R.locationFailure(409, 'locked', {}, 'en').key, 'ev_task_locked');
  assert.equal(R.locationFailure(409, 'closed', {}, 'en').key, 'ev_task_closed');
  assert.equal(R.locationFailure(403, 'not_registered', {}, 'en').key, 'ev_task_join_first');
  assert.equal(R.locationFailure(0, undefined, undefined, 'en').key, 'ev_task_offline');
  assert.equal(R.locationFailure(400, 'bad_report', {}, 'en').key, 'ev_task_failed');
  assert.equal(R.locationFailure(422, 'too_far', undefined, 'en').vars.distance, '—');
});

test('geojson: path split, numbered stops by state, radius ring, ends', () => {
  const route = { path: PATH, start: { name: 'A', lat: 23.18, lng: 75.77 }, end: { name: 'B', lat: 23.18, lng: 75.8 } };
  const lines = G.pathCollection(route, 1.5 * 1.0242);
  assert.deepEqual(lines.features.map((f) => f.properties.done), [true, false]);
  assert.equal(G.pathCollection(route, 0).features.length, 1);
  assert.equal(G.pathCollection(null, 3).features.length, 0);

  const stops = R.resolveStops([stop({ order: 1, done: true }), stop({ order: 2 })]);
  const pts = G.stopsCollection(stops, R.stopKey(stops[1]), 'en');
  assert.deepEqual(pts.features.map((f) => [f.properties.label, f.properties.state, f.properties.selected]), [['1', 'done', false], ['2', 'next', true]]);
  assert.deepEqual(pts.features[1].geometry.coordinates, [stops[1].lng, stops[1].lat]);
  assert.equal(G.stopsCollection([{ ...stops[1], nameHi: 'दो' }], null, 'hi').features[0].properties.name, 'दो');

  const ring = G.radiusCollection(stops[1]).features[0].geometry.coordinates[0];
  assert.equal(ring.length, 49);
  assert.deepEqual(ring[0], ring[48]);
  const { haversineM } = loadTs(path.join(here, '../../../components/map/geometry.ts'));
  assert.ok(Math.abs(haversineM({ lat: stops[1].lat, lng: stops[1].lng }, { lat: ring[10][1], lng: ring[10][0] }) - 150) < 2);
  assert.equal(G.radiusCollection(null).features.length, 0);

  const ends = G.endsCollection(route, { start: 'Start', end: 'End' });
  assert.deepEqual(ends.features.map((f) => f.properties.kind), ['start', 'end']);
});

test('route bounds frame path, ends and stops; names follow the language', () => {
  const route = { path: PATH, start: { name: 'A', lat: 23.18, lng: 75.77 }, end: { name: 'B', lat: 23.18, lng: 75.8 } };
  const b = R.routeBounds(route, [stop({ order: 1, lat: 23.2 })]);
  assert.equal(b[0], 75.77);
  assert.equal(b[2], 75.8);
  assert.ok(b[3] >= 23.2);
  assert.equal(R.routeBounds(null), null);
  assert.equal(R.placeLabel({ name: 'Gate', nameHi: 'द्वार' }, 'hi'), 'द्वार');
  assert.equal(R.placeLabel({ name: 'Gate', nameHi: ' ' }, 'hi'), 'Gate');
  assert.equal(R.placeLabel({ name: 'Gate', nameHi: 'द्वार' }, 'en'), 'Gate');
});
