import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunk, defaultEventId, matchEvents, milestonePct, progressPct, progressText, applyTypeDefaults, dateLabel, draftFrom, fromInput, kpis, newKey, statusChip, toBody, toInput, validateEvent, blankMilestone, blankTask } from './events.js';
import { configBody, configDefaults, configProblems, countUnder, fieldsOf, normaliseFieldErrors } from './schema.js';
import { badgeBody, typeBody, typeDraft, validateType } from './types.js';

const KINDS = [
  { kind: 'counter', title: 'Counter', configSchema: { type: 'object', required: ['label', 'target'], properties: { label: { type: 'string' }, target: { type: 'integer', minimum: 1 } } } },
  { kind: 'live_darshan', title: 'Live darshan', configSchema: { streamSlug: { type: 'string', ref: 'streams', required: true }, minutes: { type: 'number', min: 1, default: 10 } } },
  { kind: 'self_mark', title: 'Self mark', configSchema: {} },
];

test('IST round trip', () => {
  assert.equal(fromInput('2026-10-11T04:00'), '2026-10-10T22:30:00.000Z');
  assert.equal(toInput('2026-10-10T22:30:00.000Z'), '2026-10-11T04:00');
  assert.equal(fromInput(''), null);
  assert.equal(toInput(null), '');
});
test('date labels', () => {
  const at = (s) => fromInput(s);
  assert.equal(dateLabel({ schedule: { mode: 'multiday', startsAt: at('2026-10-11T04:00'), endsAt: at('2026-10-19T23:59') } }), '11 – 19 Oct');
  assert.equal(dateLabel({ schedule: { mode: 'single', startsAt: at('2026-10-17T19:00'), endsAt: null } }), '17 Oct');
  assert.equal(dateLabel({ schedule: { mode: 'always' } }), 'Always on');
  assert.equal(dateLabel({}), '—');
});
test('keys are unique and prefixed', () => {
  const a = newKey('m', []);
  assert.match(a, /^m-[a-z0-9]{4,}$/);
  let n = 0;
  const k = newKey('m', ['m-aaaa'], () => (n++ ? 0.5 : parseInt('aaaa', 36) / 36 ** 4));
  assert.notEqual(k, 'm-aaaa');
});
test('status is the server value, never a client clock', () => {
  assert.equal(statusChip({ status: 'live' }).tone, 'live');
  assert.equal(statusChip({ status: 'registration_open', full: true }).label, 'Registration full');
  assert.equal(statusChip({ status: 'draft' }).label, 'Draft');
});
test('KPIs show null unless real', () => {
  const evs = [{ id: 'a', status: 'live' }, { id: 'b', status: 'draft' }];
  assert.deepEqual(kpis(evs, { a: { joined: null, finished: null } }), { live: 1, joined: null, weekMilestones: null, completion: null });
  assert.equal(kpis(evs, { a: { joined: 10, finished: 4 } }).completion, 40);
});
test('schema: three notations, one field list', () => {
  const f = fieldsOf(KINDS[0].configSchema);
  assert.deepEqual(f.map((x) => [x.key, x.type, x.required]), [['label', 'text', true], ['target', 'number', true]]);
  assert.equal(fieldsOf(KINDS[1].configSchema)[0].type, 'ref');
  assert.equal(fieldsOf([{ key: 'x', type: 'boolean' }])[0].type, 'boolean');
  assert.equal(fieldsOf({ poojaSlug: { type: 'string' } })[0].ref, 'poojas'); // by key name
  assert.deepEqual(fieldsOf(null), []);
  assert.deepEqual(fieldsOf(KINDS[2].configSchema), []);
});
test('schema: defaults, problems, body', () => {
  assert.deepEqual(configDefaults(KINDS[1].configSchema), { streamSlug: '', minutes: 10 });
  assert.equal(configProblems(KINDS[0].configSchema, { label: '', target: '0' }).label, 'Label is required');
  assert.equal(configProblems(KINDS[0].configSchema, { label: 'x', target: '0' }).target, 'At least 1');
  assert.deepEqual(configProblems(KINDS[0].configSchema, { label: 'x', target: '108' }), {});
  assert.deepEqual(configBody(KINDS[0].configSchema, { label: ' mantra ', target: '108' }), { label: 'mantra', target: 108 });
});
test('server field errors normalise', () => {
  assert.deepEqual(normaliseFieldErrors({ 'milestones.items[2].title': 'Required' }), { 'milestones.items.2.title': 'Required' });
  assert.deepEqual(normaliseFieldErrors([{ field: 'a.b', message: 'bad' }]), { 'a.b': 'bad' });
  assert.deepEqual(normaliseFieldErrors(null), {});
  assert.equal(countUnder({ 'a.1.x': 'm', 'a.10.x': 'n' }, 'a.1'), 1);
});

function sample() {
  const d = draftFrom({ title: 'Yatra', typeSlug: 'yatra', blocks: ['schedule', 'milestones'], schedule: { mode: 'multiday', startsAt: '2026-10-10T22:30:00.000Z', endsAt: '2026-10-19T18:00:00.000Z' }, milestones: { order: 'daily', items: [] } }, KINDS);
  const m = { ...blankMilestone(), title: 'Day 1', opensAt: toInput('2026-10-10T22:30:00.000Z'), coins: '11' };
  const task = { ...blankTask(), kind: 'counter', config: { label: 'Mantra', target: '108' } };
  d.milestones.items = [{ ...m, tasks: [task] }];
  return d;
}
test('draft -> body only sends blocks that are on, keys kept, config coerced', () => {
  const d = sample();
  const b = toBody(d, KINDS);
  assert.deepEqual(b.blocks, ['schedule', 'milestones']);
  assert.equal(b.registration, undefined);
  assert.equal(b.venue, undefined);
  assert.equal(b.milestones.items[0].key, d.milestones.items[0].key);
  assert.deepEqual(b.milestones.items[0].tasks[0].config, { label: 'Mantra', target: 108 });
  assert.equal(b.milestones.items[0].coins, 11);
  assert.equal(b.schedule.startsAt, '2026-10-10T22:30:00.000Z');
  assert.equal(b.milestones.items[0].link, null);
});
test('turning a block off drops it from the body but keeps its draft', () => {
  const d = sample();
  const off = { ...d, blocks: ['schedule'] };
  assert.equal(toBody(off, KINDS).milestones, undefined);
  assert.equal(off.milestones.items.length, 1);
});
test('validation', () => {
  const d = sample();
  assert.deepEqual(validateEvent(d, KINDS), {});
  d.milestones.items[0].tasks[0].config.target = '0';
  assert.equal(validateEvent(d, KINDS)['milestones.items.0.tasks.0.config.target'], 'At least 1');
  const noTitle = { ...sample(), title: '', published: true, blocks: ['milestones'] };
  const e = validateEvent(noTitle, KINDS);
  assert.ok(e.title && e.blocks);
  const paid = { ...sample(), blocks: ['registration'], registration: { ...sample().registration, mode: 'coins', coins: '' } };
  assert.ok(validateEvent(paid, KINDS)['registration.coins']);
  const r = { ...sample(), blocks: ['rewards'], rewards: [{ kind: 'badge', coins: '', badgeSlug: '', on: 'milestone', milestoneKey: '' }] };
  assert.ok(validateEvent(r, KINDS)['rewards.0.badgeSlug'] && validateEvent(r, KINDS)['rewards.0.milestoneKey']);
});
test('type defaults prefill without touching the title', () => {
  const type = { slug: 'vrat', defaults: { blocks: ['schedule', 'milestones'], milestones: { order: 'daily' } } };
  const d = applyTypeDefaults({ ...sample(), title: 'Mine' }, type, KINDS);
  assert.equal(d.title, 'Mine');
  assert.equal(d.milestones.order, 'daily');
  assert.equal(d.typeSlug, 'vrat');
});
test('types keep unknown defaults', () => {
  const orig = { slug: 'x', order: 10, defaults: { blocks: ['schedule'], gradientHint: 1, schedule: { mode: 'single', durationH: 3 } } };
  const dr = typeDraft(orig);
  const b = typeBody({ ...dr, name: 'Talk', scheduleMode: 'multiday' }, orig);
  assert.equal(b.defaults.gradientHint, 1);
  assert.deepEqual(b.defaults.schedule, { mode: 'multiday', durationH: 3 });
  assert.equal(b.slug, undefined);
  assert.equal(typeBody({ ...dr, name: 'New Kind' }, null, [{ order: 20 }]).slug, 'new-kind');
  assert.ok(validateType({ ...dr, name: '' }).name);
  assert.ok(validateType({ ...dr, name: 'Talk' }, { taken: ['talk'] }).name);
  assert.equal(badgeBody({ name: 'Nav Durga 2026', nameHi: '', description: '', art: '' }).slug, 'nav-durga-2026');
});

test('participants: progress, picker, default event', () => {
  assert.equal(progressPct({ done: 3, total: 9 }), 33);
  assert.equal(progressPct({ done: 0, total: 0 }), null);
  assert.equal(progressPct(null), null);
  assert.equal(progressText({ done: 3, total: 9 }), '3 of 9');
  assert.equal(progressText(undefined), '—');
  const evs = [
    { id: 'a', title: 'Old live', status: 'live', schedule: { startsAt: '2026-01-01T00:00:00Z' } },
    { id: 'b', title: 'New ended', status: 'ended', schedule: { startsAt: '2026-09-01T00:00:00Z' } },
    { id: 'c', title: 'Newer live', status: 'live', schedule: { startsAt: '2026-05-01T00:00:00Z' } },
  ];
  assert.equal(defaultEventId(evs), 'c');
  assert.equal(defaultEventId(evs.filter((e) => e.status !== 'live')), 'b');
  assert.equal(defaultEventId([]), '');
  assert.deepEqual(matchEvents(evs, 'live').map((e) => e.id), ['c', 'a']);
});
test('stats: per-milestone pct is null unless known; chunking', () => {
  const st = { perMilestone: [{ key: 'm1', completedCount: 2, completedPct: 66.6 }, { key: 'm2', completedCount: 0, completedPct: null }] };
  assert.equal(milestonePct(st, 'm1'), 67);
  assert.equal(milestonePct(st, 'm2'), null);
  assert.equal(milestonePct(st, 'nope'), null);
  assert.equal(milestonePct(null, 'm1'), null);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
