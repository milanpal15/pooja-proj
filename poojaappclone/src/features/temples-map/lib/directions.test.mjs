/** node --test src/features/temples-map/lib/directions.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTs } from './load-ts.mjs';

const { directionsUrls } = loadTs('directions');

test('Android: geo URI with a labelled query, then the web fallback', () => {
  const [geo, web] = directionsUrls({ lat: 19.0176, lng: 72.8562, name: 'Shri Ram Mandir' }, 'android');
  assert.equal(geo, 'geo:19.017600,72.856200?q=19.017600,72.856200(Shri%20Ram%20Mandir)');
  assert.equal(web, 'https://www.google.com/maps/dir/?api=1&destination=19.017600,72.856200');
});

test('special characters in names cannot break out of the label', () => {
  const [geo] = directionsUrls({ lat: 1.5, lng: 2.5, name: 'Mandir (Old) & Sons #1 ?x=1 \'q\'' }, 'android');
  assert.ok(geo.startsWith('geo:1.500000,2.500000?q=1.500000,2.500000('));
  const label = geo.slice(geo.indexOf('(') + 1, -1);
  assert.ok(!/[()&#? ']/.test(label), label);
  assert.equal(decodeURIComponent(label), "Mandir (Old) & Sons #1 ?x=1 'q'");
});

test('Devanagari names are percent-encoded', () => {
  const [geo] = directionsUrls({ lat: 1, lng: 2, name: 'श्री राम' }, 'android');
  assert.ok(/^[\x20-\x7e]+$/.test(geo), geo);
  assert.ok(geo.includes(encodeURIComponent('श्री राम')));
});

test('no name means no label; iOS uses Apple Maps first', () => {
  const [geo] = directionsUrls({ lat: 1, lng: 2, name: '  ' }, 'android');
  assert.equal(geo, 'geo:1.000000,2.000000?q=1.000000,2.000000');
  const [apple, web] = directionsUrls({ lat: 1, lng: 2, name: 'A&B' }, 'ios');
  assert.equal(apple, 'https://maps.apple.com/?daddr=1.000000,2.000000&q=A%26B');
  assert.ok(web.startsWith('https://www.google.com/maps/dir/'));
});
