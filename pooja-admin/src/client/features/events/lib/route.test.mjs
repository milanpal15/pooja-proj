import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftFrom, toBody, validateEvent } from './events.js';
import {
  blankRoute, effectivePath, geoProblems, isGeoSchema, isInPathOrder, orderMilestonesByRoute, routeBody, routeFrom, routeLengthKm, routeProblems, stopPlacement, stopsInPathOrder, stopsOf, warningText, warningWhere, warningsByStop,
} from './route.js';

const PLACE_SCHEMA = { type: 'object', required: ['lat', 'lng', 'name'], properties: { lat: { type: 'number', minimum: -90, maximum: 90 }, lng: { type: 'number', minimum: -180, maximum: 180 }, radiusM: { type: 'integer', minimum: 50, maximum: 2000, default: 150 }, name: { type: 'string' }, nameHi: { type: 'string' }, note: { type: 'string' } } };
const KINDS = [
  { kind: 'location', title: 'Be at a place', configSchema: PLACE_SCHEMA },
  { kind: 'self_mark', title: 'Mark', configSchema: {} },
];
const apiRoute = {
  start: { name: 'Haridwar', nameHi: '', lat: 0, lng: 0 },
  end: { name: 'Rishikesh', nameHi: '', lat: 0, lng: 2 },
  path: [[0, 0], [0, 1], [0, 2]],
  lengthKm: 222.4,
  mapReveal: 'all',
};
const ms = (key, name, lat, lng) => ({ key, title: name, tasks: [{ key: `${key}-t`, kind: 'location', config: { lat, lng, radiusM: 150, name } }] });

test('route round trip: path = start + via + end', () => {
  const r = routeFrom(apiRoute);
  assert.deepEqual(r.via, [[0, 1]]);
  assert.deepEqual(effectivePath(r), apiRoute.path);
  const body = routeBody(r);
  assert.deepEqual(body.path, apiRoute.path);
  assert.equal(body.start.name, 'Haridwar');
  assert.equal('lengthKm' in body, false); // the server computes it
  assert.deepEqual(routeFrom(null), blankRoute());
  assert.deepEqual(effectivePath(blankRoute()), []);
});
test('an unset end is left out of the path; two points make a straight route', () => {
  const r = routeFrom({ ...apiRoute, end: { name: '', lat: null, lng: null }, path: [[0, 0]] });
  assert.equal(effectivePath(r).length, 1);
  assert.equal(routeFrom({ ...apiRoute, path: [[0, 0], [0, 2]] }).via.length, 0);
});
test('length: live haversine, the server value wins while the path is unchanged', () => {
  const r = routeFrom(apiRoute);
  assert.equal(routeLengthKm(r), 222.4);
  const moved = { ...r, via: [[0, 1.2]] };
  assert.ok(Math.abs(routeLengthKm(moved) - 222.39) < 0.2);
  assert.notEqual(routeLengthKm({ ...routeFrom({ ...apiRoute, lengthKm: null }) }), 222.4);
});
test('route validation messages', () => {
  assert.deepEqual(Object.keys(routeProblems(blankRoute())).sort(), ['route.end.name', 'route.end.point', 'route.path', 'route.start.name', 'route.start.point']);
  assert.deepEqual(routeProblems(routeFrom(apiRoute)), {});
  const r = routeFrom(apiRoute);
  assert.match(routeProblems({ ...r, start: { ...r.start, name: 'x'.repeat(81) } })['route.start.name'], /80/);
  assert.match(routeProblems({ ...r, via: Array.from({ length: 499 }, () => [0, 1]) })['route.path'], /500/);
  assert.match(routeProblems({ ...r, via: [[95, 0]] })['route.path'], /outside/);
});
test('place checks: ranges, radius, name, note', () => {
  assert.deepEqual(geoProblems({ lat: 19, lng: 72, radiusM: 150, name: 'Gate' }), {});
  assert.ok(geoProblems({ lat: '', lng: '', name: '' }).lat);
  assert.match(geoProblems({ lat: 91, lng: 0, name: 'x' }).lat, /90/);
  assert.match(geoProblems({ lat: 0, lng: 181, name: 'x' }).lng, /180/);
  assert.match(geoProblems({ lat: 0, lng: 0, radiusM: 49, name: 'x' }).radiusM, /50/);
  assert.match(geoProblems({ lat: 0, lng: 0, radiusM: 2001, name: 'x' }).radiusM, /2000/);
  assert.equal(geoProblems({ lat: 0, lng: 0, radiusM: '', name: 'x' }).radiusM, undefined); // blank = default
  assert.match(geoProblems({ lat: 0, lng: 0, name: '' }).name, /Name/);
  assert.match(geoProblems({ lat: 0, lng: 0, name: 'x', note: 'n'.repeat(161) }).note, /160/);
  assert.equal(geoProblems({ lat: 0, lng: 0 }, ['lat', 'lng']).name, undefined);
});
test('a place kind is recognised by its schema, never by its name', () => {
  assert.equal(isGeoSchema(PLACE_SCHEMA), true);
  assert.equal(isGeoSchema({}), false);
  assert.equal(isGeoSchema({ target: { type: 'number' } }), false);
  assert.equal(isGeoSchema({ lat: { type: 'number' }, lng: { type: 'number' } }), true);
});
test('stops: km along the path, off-route distance, order', () => {
  const route = routeFrom(apiRoute);
  const items = [ms('a', 'Far', 0, 1.8), { key: 'b', title: 'Plain', tasks: [{ key: 'bt', kind: 'self_mark', config: {} }] }, ms('c', 'Near', 0.0001, 0.2), ms('d', 'Blank', '', '')];
  const stops = stopsOf(items, route, KINDS);
  assert.deepEqual(stops.map((s) => s.mi), [0, 2, 3]);
  const placed = stopsInPathOrder(stops);
  assert.deepEqual(placed.map((s) => [s.name, s.order]), [['Near', 1], ['Far', 2]]);
  assert.ok(Math.abs(placed[0].routeKm - 22.24) < 0.2);
  assert.ok(placed[0].offRouteM < 20);
  assert.equal(stops[2].point, null); // no place yet: listed, not placed
});
test('ordering moves only the stop milestones, only on request, and is stable', () => {
  const route = routeFrom(apiRoute);
  const items = [ms('a', 'Far', 0, 1.8), { key: 'b', title: 'Plain', tasks: [] }, ms('c', 'Near', 0, 0.2), ms('e', 'Mid', 0, 1)];
  assert.equal(isInPathOrder(items, route, KINDS), false);
  const next = orderMilestonesByRoute(items, route, KINDS);
  assert.deepEqual(next.map((m) => m.key), ['c', 'b', 'e', 'a']); // 'b' keeps slot 1
  assert.equal(items[0].key, 'a'); // input untouched
  assert.equal(orderMilestonesByRoute(next, route, KINDS), next); // already ordered: same array
  const ties = [ms('x', 'X', 0, 1), ms('y', 'Y', 0, 1)];
  assert.equal(orderMilestonesByRoute(ties, route, KINDS), ties);
});
test('a server routeKm is used only while the stop and the path are as saved', () => {
  const e = { blocks: ['route', 'milestones'], typeSlug: 't', title: 'Y', route: apiRoute, milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all' }, items: [{ key: 'a', title: 'A', tasks: [{ key: 't1', kind: 'location', config: { lat: 0, lng: 0.5, radiusM: 150, name: 'A', routeKm: 55.5, offRouteM: 0 } }] }] } };
  const d = draftFrom(e, KINDS);
  const cfg = d.milestones.items[0].tasks[0].config;
  assert.equal(stopPlacement(cfg, d.route).routeKm, 55.5);
  assert.equal(stopPlacement(cfg, d.route).fromServer, true);
  const moved = stopPlacement({ ...cfg, lng: 0.6 }, d.route);
  assert.equal(moved.fromServer, false);
  const reshaped = stopPlacement(cfg, { ...d.route, via: [[0, 1.1]] });
  assert.equal(reshaped.fromServer, false);
});
test('body: route is sent when on; server-computed fields are not', () => {
  const e = { blocks: ['route', 'milestones'], typeSlug: 't', title: 'Y', route: apiRoute, milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all' }, items: [{ key: 'a', title: 'A', tasks: [{ key: 't1', kind: 'location', config: { lat: 0, lng: 0.5, radiusM: 150, name: 'A', routeKm: 55.5, offRouteM: 0 } }] }] } };
  const d = draftFrom(e, KINDS);
  const body = toBody(d, KINDS);
  assert.deepEqual(body.route.path, apiRoute.path);
  assert.deepEqual(body.milestones.items[0].tasks[0].config, { lat: 0, lng: 0.5, radiusM: 150, name: 'A' });
  assert.ok(body.blocks.includes('route'));
  assert.equal(toBody({ ...d, blocks: ['milestones'] }, KINDS).route, undefined);
});
test('validateEvent: route and place problems use the API field paths', () => {
  const d = draftFrom({ blocks: ['route', 'milestones'], typeSlug: 't', title: 'Y', milestones: { order: 'any', items: [{ key: 'a', title: 'A', tasks: [{ key: 't1', kind: 'location', config: { lat: '', lng: '', name: '' } }] }] } }, KINDS);
  const e = validateEvent(d, KINDS);
  assert.ok(e['route.start.point']);
  assert.ok(e['milestones.items.0.tasks.0.config.lat']);
  assert.ok(e['milestones.items.0.tasks.0.config.name']);
  assert.equal(validateEvent({ ...d, blocks: ['milestones'] }, KINDS)['route.path'], undefined);
});
test('save warnings map onto stops', () => {
  const items = [ms('a', 'A', 0, 0), ms('b', 'B', 0, 1)];
  const w1 = { path: 'milestones[1].tasks[0].config', code: 'off_route', distanceM: 1450 };
  const w2 = { path: 'milestones.items.0.tasks.0', code: 'off_route', distanceM: 1200 };
  const w3 = { milestoneKey: 'b', taskKey: 'b-t', code: 'off_route', distanceM: 50 };
  assert.equal(warningsByStop([w1], items)['1:0'], w1);
  assert.equal(warningsByStop([w2], items)['0:0'], w2);
  assert.equal(warningsByStop([w3], items)['1:0'], w3);
  assert.deepEqual(warningsByStop(null, items), {});
  assert.equal(warningWhere(w1, items), 'B');
  assert.equal(warningWhere({ path: 'x' }, items), '');
  assert.match(warningText(w1), /1\.4 km from the path/);
  assert.match(warningText({ code: 'off_route', distanceM: 1004 }), /1\.0 km/);
  assert.equal(warningText({ code: 'other', message: 'hello' }), 'hello');
});
