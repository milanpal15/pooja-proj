import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dataLine, fillTemplate, summaryLine } from './summary.js';
import { normaliseRegistry } from './registry.js';

const REG = normaliseRegistry({
  blockTypes: [
    { type: 'quick_grid', title: 'Services grid', summary: '{count} shortcuts · {columns} per row', data: { modes: ['inline'] } },
    { type: 'shelf', title: 'Shelf of cards', summary: '{source} · {count} cards', data: { modes: ['inline', 'source'] } },
    { type: 'slider', title: 'Promo slider', summary: '{count} slides · managed in Home slider', description: 'The Home slider', data: { modes: ['source'] } },
    { type: 'share', title: 'Share with family', data: { modes: [] }, description: 'Share the app' },
  ],
  sources: [{ key: 'poojas.upcoming', title: 'Upcoming poojas' }],
});

test('summary: tokens come from the block, empty parts drop out', () => {
  const grid = { type: 'quick_grid', props: { columns: 4 }, data: { mode: 'inline', items: [{ title: 'a' }, { title: 'b' }, { title: 'c', enabled: false }] } };
  assert.equal(summaryLine(grid, REG), '2 shortcuts · 4 per row', 'a hidden tile is not counted');
  assert.equal(summaryLine({ type: 'shelf', props: {}, data: { mode: 'source', source: 'poojas.upcoming', params: {} } }, REG), 'Upcoming poojas');
  assert.equal(summaryLine({ type: 'shelf', props: {}, data: { mode: 'inline', items: [{}, {}, {}] } }, REG), '3 cards');
  assert.equal(summaryLine({ type: 'slider', props: {}, data: { mode: 'source', source: 'hero', limit: 8 } }, REG), 'managed in Home slider');
  assert.equal(summaryLine({ type: 'share', props: {}, data: null }, REG), 'Share the app', 'no template, no data: the type description');
  assert.equal(summaryLine({ type: 'mystery', props: {}, data: null }, REG), 'Unknown section type');
});

test('summary: templates and the data line', () => {
  assert.equal(fillTemplate('Auto · max {limit}', { limit: '' }), 'Auto');
  assert.equal(fillTemplate('Auto · max {limit}', { limit: '6' }), 'Auto · max 6');
  assert.equal(fillTemplate('{titles}', { titles: 'A, B' }), 'A, B');
  assert.equal(dataLine({ data: { mode: 'inline', items: [{}] } }, REG), '1 card');
  assert.equal(dataLine({ data: { mode: 'source', source: 'poojas.upcoming', limit: 6 } }, REG), 'Upcoming poojas · max 6');
  assert.equal(dataLine({ data: null }, REG), '');
});
