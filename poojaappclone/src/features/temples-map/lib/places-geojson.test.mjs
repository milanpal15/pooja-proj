/** node --test src/features/temples-map/lib/places-geojson.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTs } from './load-ts.mjs';

const g = loadTs('places-geojson');

const place = (id, lat, lng, extra = {}) => ({ id, name: `Temple ${id}`, nameHi: null, lat, lng, ...extra });
const temple = (id, lat, lng) => ({ id, name: `T-${id}`, accent: '#FFC13D', trim: '#E4572E', coords: { lat, lng } });

test('managed collection: only temples with real coordinates, stable keys, deduped by id', () => {
  const c = g.buildManagedCollection([
    temple('kashi', 25.31, 83.01),
    temple('unset', 0, 0),
    temple('kashi', 25.31, 83.01),
    temple('somnath', 20.89, 70.4),
  ]);
  assert.deepEqual(
    c.features.map((f) => f.properties.key),
    ['temple:kashi', 'temple:somnath'],
  );
  assert.deepEqual(c.features[0].geometry.coordinates, [83.01, 25.31]); // lng, lat
  assert.equal(c.features[0].properties.accent, '#FFC13D');
});

test('places collection: GeoJSON order, ids as keys, duplicates and unusable points dropped', () => {
  const c = g.buildPlacesCollection(
    [place('osm:node/1', 19.0, 72.8), place('osm:node/1', 19.0, 72.8), place('osm:way/2', 0, 0), place('osm:node/3', 19.01, 72.81)],
    [],
    'en',
  );
  assert.deepEqual(c.features.map((f) => f.properties.key), ['osm:node/1', 'osm:node/3']);
  assert.deepEqual(c.features[0].geometry.coordinates, [72.8, 19.0]);
});

test('a place within 150 m of a dashboard temple is not drawn twice; 300 m away it is', () => {
  const managed = [temple('kashi', 25.31, 83.01)];
  const near = place('osm:node/9', 25.3105, 83.01); // ~55 m
  const far = place('osm:node/10', 25.3135, 83.01); // ~280 m
  const c = g.buildPlacesCollection([near, far], managed, 'en');
  assert.deepEqual(c.features.map((f) => f.properties.key), ['osm:node/10']);
});

test('labels follow the app language; the cap keeps the first (nearest) places', () => {
  const p = place('osm:node/1', 19, 72.8, { nameHi: 'श्री राम मंदिर' });
  assert.equal(g.buildPlacesCollection([p], [], 'hi').features[0].properties.label, 'श्री राम मंदिर');
  assert.equal(g.buildPlacesCollection([p], [], 'en').features[0].properties.label, 'Temple osm:node/1');

  const many = Array.from({ length: 120 }, (_, i) => place(`osm:node/${i}`, 19 + i * 0.001, 72.8));
  const c = g.buildPlacesCollection(many, [], 'en', { max: 80 });
  assert.equal(c.features.length, 80);
  assert.equal(c.features[0].properties.key, 'osm:node/0');
  assert.equal(c.features[79].properties.key, 'osm:node/79');
});

test('same input gives the same keys and order every time (no re-render churn)', () => {
  const input = [place('osm:node/2', 19, 72.8), place('osm:node/1', 19.1, 72.8)];
  const a = JSON.stringify(g.buildPlacesCollection(input, [], 'en'));
  const b = JSON.stringify(g.buildPlacesCollection(input, [], 'en'));
  assert.equal(a, b);
});

test('singlePoint: a usable point, or an empty collection', () => {
  assert.equal(g.singlePoint({ lat: 1, lng: 2 }).features.length, 1);
  assert.equal(g.singlePoint(null).features.length, 0);
  assert.equal(g.singlePoint({ lat: 0, lng: 0 }).features.length, 0);
});
