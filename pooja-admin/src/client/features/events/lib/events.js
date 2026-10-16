/**
 * Pure rules for Events (docs/EVENTS.md): the draft <-> API-body mapping, IST
 * time handling, stable keys, status chips, KPIs and validation. No React, no
 * fetching, so `node --test` can pin them.
 *
 * Principle 0 of the contract: nothing here may branch on an event type or a
 * task kind. A type is only a preset of defaults; a kind is only a registry
 * entry read through `lib/schema.js`.
 */
import { geoProblems, isGeoSchema, routeBody, routeFrom, routeProblems, blankRoute, stopSig } from './route.js';
import { configBody, configDefaults, configProblems, fieldsOf } from './schema.js';

export const MAX_MILESTONES = 60;
export const MAX_TASKS = 8;

export const BLOCKS = [
  { id: 'schedule', label: 'Schedule', hint: 'When it happens' },
  { id: 'registration', label: 'Registration', hint: 'Devotees join, with a QR pass if you want one' },
  { id: 'venue', label: 'Venue', hint: 'Where it happens, or the online link' },
  { id: 'route', label: 'Route', hint: 'A journey from a start to an end along a path; location milestones are its stops' },
  { id: 'milestones', label: 'Milestones', hint: 'Steps a devotee completes' },
  { id: 'rewards', label: 'Rewards', hint: 'Coins, badges and certificates' },
  { id: 'content', label: 'Content', hint: 'About text, gallery, FAQs and links' },
];
export const BLOCK_IDS = BLOCKS.map((b) => b.id);

export const SCHEDULE_MODES = [
  { value: 'single', label: 'One time' },
  { value: 'multiday', label: 'Several days' },
  { value: 'always', label: 'Always on' },
];
export const REG_MODES = [
  { value: 'none', label: 'No joining' },
  { value: 'free', label: 'Free' },
  { value: 'coins', label: 'Paid in coins' },
];
export const ORDERS = [
  { value: 'daily', label: 'One per day' },
  { value: 'sequential', label: 'One after another' },
  { value: 'any', label: 'Any order' },
];
export const MISSED = [
  { value: 'catch_up_next', label: 'Can catch up until the next one opens' },
  { value: 'lock_at_end', label: 'Closed once its time has passed' },
  { value: 'catch_up_any', label: 'Can be done any time before the event ends' },
];
export const RULES = [
  { value: 'all', label: 'All must be done' },
  { value: 'atLeast', label: 'At least N must be done' },
  { value: 'any', label: 'Any one is enough' },
];
export const LANGUAGES = [
  { value: 'all', label: 'All languages' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
];
export const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'choice', label: 'Choice' },
  { value: 'number', label: 'Number' },
];
export const REWARD_KINDS = [
  { value: 'coins', label: 'Coins' },
  { value: 'badge', label: 'Badge' },
  { value: 'certificate', label: 'Certificate' },
];

export const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * A stable key for a milestone, task or form field: generated once, saved, and
 * never shown as an editable value (progress is recorded against it, so a
 * changed key would orphan every devotee's progress).
 */
export function newKey(prefix, taken = [], rnd = Math.random) {
  for (let i = 0; i < 50; i += 1) {
    const k = `${prefix}-${rnd().toString(36).slice(2, 8).padEnd(4, '0')}`;
    if (!taken.includes(k)) return k;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ IST -- */
const IST = 330 * 60000;
/** ISO instant -> "YYYY-MM-DDTHH:mm" in IST, for a datetime-local input. '' when blank. */
export function toInput(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? '' : new Date(t + IST).toISOString().slice(0, 16);
}
/** A datetime-local value, read as IST -> ISO instant. '' / null when blank. */
export function fromInput(v) {
  if (!v) return null;
  const t = new Date(`${v}:00+05:30`).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayParts = (iso) => {
  const s = toInput(iso);
  return s ? { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10), key: s.slice(0, 10), time: s.slice(11) } : null;
};
/** "11 – 19 Oct", "17 Oct", "Always on", or "—". Works on the API row. */
export function dateLabel(event) {
  const s = event?.schedule;
  if (!s) return '—';
  if (s.mode === 'always') return 'Always on';
  const a = dayParts(s.startsAt);
  if (!a) return '—';
  const b = dayParts(s.endsAt);
  if (!b || b.key === a.key) return `${a.d} ${MONTHS[a.m]}`;
  return a.m === b.m && a.y === b.y ? `${a.d} – ${b.d} ${MONTHS[b.m]}` : `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]}`;
}
/** "4:00 am" from an ISO instant, in IST. */
export function clockOf(iso) {
  const p = dayParts(iso);
  if (!p) return '';
  const [h, mi] = p.time.split(':').map(Number);
  return `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/* --------------------------------------------------------------- status -- */
/** The status chip from the API's derived `status` (never computed here: the server owns the clock). */
export function statusChip(event) {
  const s = event?.status;
  const starts = dayParts(event?.schedule?.startsAt);
  if (s === 'draft') return { key: 'draft', tone: 'warning', label: 'Draft' };
  if (s === 'scheduled') return { key: 'scheduled', tone: 'info', label: starts ? `Starts ${starts.d} ${MONTHS[starts.m]}` : 'Scheduled' };
  if (s === 'registration_open') return { key: 'registration_open', tone: 'success', label: event?.full ? 'Registration full' : 'Registration open' };
  if (s === 'live') return { key: 'live', tone: 'live', label: 'Live' };
  if (s === 'ended') return { key: 'ended', tone: 'neutral', label: 'Ended' };
  return { key: 'unknown', tone: 'neutral', label: event?.published === false ? 'Draft' : '—' };
}
export const STATUS_FILTERS = [
  { value: '', label: 'Status: All' },
  { value: 'live', label: 'Live' },
  { value: 'registration_open', label: 'Registration open' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ended', label: 'Ended' },
  { value: 'draft', label: 'Draft' },
];

export const milestoneCountOf = (e) => e?.milestoneCount ?? e?.milestones?.items?.length ?? 0;
export function subtitleOf(e) {
  const where = e?.blocks && !e.blocks.includes('venue') ? 'Online' : e?.venue?.name ? e.venue.name : e?.venue ? 'In person' : 'Online';
  const how = e?.milestones?.order ? ORDERS.find((o) => o.value === e.milestones.order)?.label.toLowerCase() : '';
  return [where, how && milestoneCountOf(e) ? `milestones ${how}` : ''].filter(Boolean).join(' · ');
}

/** Honest numbers: a count is shown only when the server sent one. */
export const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));
export function pct(finished, joined) {
  if (finished == null || joined == null || !(joined > 0)) return null;
  return Math.round((finished / joined) * 100);
}
/** The four KPI tiles. `stats` is { [eventId]: { joined, finished } }, each possibly null. */
export function kpis(events, stats = {}) {
  const live = events.filter((e) => e.status === 'live' || e.status === 'registration_open').length;
  const sum = (key) => {
    const vals = events.map((e) => stats[e.id ?? e._id]?.[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const joined = sum('joined');
  const finished = sum('finished');
  return { live, joined, weekMilestones: null, completion: pct(finished, joined) };
}

/* ---------------------------------------------------------- participants -- */
/** Percentage of a progress object `{done,total}`, or null when there is no total. */
export function progressPct(p) {
  if (!p || p.done == null || !(p.total > 0)) return null;
  return Math.min(100, Math.round((p.done / p.total) * 100));
}
/** "3 of 9", or "—" when unknown. */
export const progressText = (p) => (p && p.done != null && p.total != null ? `${p.done} of ${p.total}` : '—');
/** Events the picker lists: newest start first, filtered by a title/slug search. */
export function matchEvents(events, q = '') {
  const needle = String(q).trim().toLowerCase();
  const start = (e) => String(e.schedule?.startsAt || e.createdAt || '');
  return events
    .filter((e) => !needle || `${e.title || ''} ${e.slug || ''}`.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => start(b).localeCompare(start(a)));
}
/** The event shown first: the most recent live one, else the most recent of all (id or ''). */
export function defaultEventId(events) {
  const sorted = matchEvents(events);
  const pick = sorted.find((e) => e.status === 'live') || sorted[0];
  return pick ? String(pick.id ?? pick._id ?? '') : '';
}
/** Completion share for one milestone from a stats document: a number, or null when unknown. */
export function milestonePct(stats, key) {
  const row = stats?.perMilestone?.find?.((m) => m.key === key);
  return row?.completedPct == null ? null : Math.round(row.completedPct);
}
/** Split `list` into groups of `size` (the stats are fetched a few at a time). */
export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/* ---------------------------------------------------------------- drafts -- */
const str = (v) => (typeof v === 'string' ? v : '');
const numStr = (v) => (v == null || v === '' ? '' : String(v));

export const blankField = (taken = []) => ({ key: newKey('f', taken), label: '', labelHi: '', type: 'text', required: false, options: [] });
export const blankTask = (taken = []) => ({ key: newKey('t', taken), kind: '', title: '', titleHi: '', config: {} });
export const blankMilestone = (taken = []) => ({
  key: newKey('m', taken), title: '', titleHi: '', summary: '', opensAt: '', coins: '0', linkLabel: '', linkRoute: '',
  completion: { rule: 'all', n: '' }, tasks: [],
});
export const blankReward = () => ({ kind: 'coins', coins: '', badgeSlug: '', on: 'event', milestoneKey: '' });

export function blankEvent() {
  return {
    slug: '', typeSlug: '', tags: [], title: '', titleHi: '', summary: '', summaryHi: '', cover: '', language: 'all',
    color: '', published: false, blocks: ['schedule'],
    schedule: { mode: 'single', startsAt: '', endsAt: '' },
    registration: { mode: 'free', coins: '', capacity: '', opensAt: '', closesAt: '', pass: true, fields: [] },
    venue: { name: '', city: '', address: '', lat: '', lng: '', organiser: '', onlineUrl: '' },
    route: blankRoute(),
    milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: '' }, items: [] },
    rewards: [],
    content: { body: '', bodyHi: '', gallery: [], faq: [], links: [] },
    schemaVersion: 1,
  };
}

/** A server-computed `routeKm` is trusted only while the stop and the path are as saved. */
const withSig = (config, route) => (config.routeKm != null ? { ...config, _sig: stopSig(config, route) } : config);

/** An API event (or a type's `defaults`) -> the editable draft. Missing parts take blank values. */
export function draftFrom(e = {}, kinds = []) {
  const b = blankEvent();
  const kindOf = (k) => kinds.find((x) => x.kind === k);
  const blocks = Array.isArray(e.blocks) ? e.blocks.filter((x) => BLOCK_IDS.includes(x)) : b.blocks;
  const sc = e.schedule || {};
  const rg = e.registration || {};
  const vn = e.venue || {};
  const ms = e.milestones || {};
  const ct = e.content || {};
  const route = routeFrom(e.route);
  return {
    ...b,
    slug: str(e.slug), typeSlug: str(e.typeSlug), tags: Array.isArray(e.tags) ? e.tags : [],
    title: str(e.title), titleHi: str(e.titleHi), summary: str(e.summary), summaryHi: str(e.summaryHi), cover: str(e.cover),
    language: e.language || 'all', color: str(e.theme?.color), published: e.published === true,
    blocks, schemaVersion: e.schemaVersion || 1,
    schedule: { mode: sc.mode || b.schedule.mode, startsAt: toInput(sc.startsAt), endsAt: toInput(sc.endsAt) },
    registration: {
      mode: rg.mode || 'free', coins: numStr(rg.coins), capacity: numStr(rg.capacity), opensAt: toInput(rg.opensAt),
      closesAt: toInput(rg.closesAt), pass: rg.pass !== false,
      fields: (rg.fields || []).map((f) => ({ key: f.key, label: str(f.label), labelHi: str(f.labelHi), type: f.type || 'text', required: !!f.required, options: f.options || [] })),
    },
    venue: { name: str(vn.name), city: str(vn.city), address: str(vn.address), lat: numStr(vn.lat), lng: numStr(vn.lng), organiser: str(vn.organiser), onlineUrl: str(vn.onlineUrl) },
    route,
    milestones: {
      order: ms.order || 'any', missed: ms.missed || 'catch_up_next',
      completion: { rule: ms.completion?.rule || 'all', n: numStr(ms.completion?.n) },
      items: (ms.items || []).map((m) => ({
        key: m.key, title: str(m.title), titleHi: str(m.titleHi), summary: str(m.summary), opensAt: toInput(m.opensAt), coins: numStr(m.coins ?? 0),
        linkLabel: str(m.link?.label), linkRoute: str(m.link?.route),
        completion: { rule: m.completion?.rule || 'all', n: numStr(m.completion?.n) },
        tasks: (m.tasks || []).map((t) => ({
          key: t.key, kind: str(t.kind), title: str(t.title), titleHi: str(t.titleHi),
          // Stored values over registry defaults; a kind the registry no longer lists keeps its config untouched.
          config: withSig({ ...(kindOf(t.kind) ? configDefaults(kindOf(t.kind).configSchema) : {}), ...(t.config || {}) }, route),
        })),
      })),
    },
    rewards: (e.rewards || []).map((r) => ({
      kind: r.kind || 'coins', coins: numStr(r.coins), badgeSlug: str(r.badgeSlug), on: r.trigger?.on || 'event', milestoneKey: str(r.trigger?.milestoneKey),
    })),
    content: {
      body: str(ct.body), bodyHi: str(ct.bodyHi), gallery: Array.isArray(ct.gallery) ? ct.gallery : [],
      faq: (ct.faq || []).map((f) => ({ q: str(f.q), a: str(f.a) })), links: (ct.links || []).map((l) => ({ label: str(l.label), route: str(l.route) })),
    },
  };
}

const t = (v) => String(v ?? '').trim();
const toNum = (v, fallback = null) => (v === '' || v == null ? fallback : Number(v));

/** The draft -> the API body. Only blocks listed in `blocks` are sent; configs go through each kind's schema. */
export function toBody(d, kinds = []) {
  const kindOf = (k) => kinds.find((x) => x.kind === k);
  const has = (id) => d.blocks.includes(id);
  const body = {
    ...(d.slug ? { slug: d.slug } : {}),
    schemaVersion: d.schemaVersion || 1, typeSlug: d.typeSlug, tags: d.tags,
    title: t(d.title), titleHi: t(d.titleHi), summary: t(d.summary), summaryHi: t(d.summaryHi), cover: d.cover, language: d.language,
    theme: d.color ? { color: d.color } : undefined, published: !!d.published, blocks: d.blocks.slice(),
  };
  if (has('schedule')) body.schedule = { mode: d.schedule.mode, startsAt: fromInput(d.schedule.startsAt), endsAt: d.schedule.mode === 'always' ? null : fromInput(d.schedule.endsAt) };
  if (has('registration')) {
    const r = d.registration;
    body.registration = {
      mode: r.mode, coins: r.mode === 'coins' ? toNum(r.coins, 0) : 0, capacity: toNum(r.capacity), opensAt: fromInput(r.opensAt), closesAt: fromInput(r.closesAt), pass: !!r.pass,
      fields: r.fields.map((f) => ({ key: f.key, label: t(f.label), labelHi: t(f.labelHi), type: f.type, required: !!f.required, options: f.type === 'choice' ? f.options.map(t).filter(Boolean) : [] })),
    };
  }
  if (has('venue')) {
    const v = d.venue;
    body.venue = { name: t(v.name), city: t(v.city), address: t(v.address), lat: toNum(v.lat), lng: toNum(v.lng), organiser: t(v.organiser), onlineUrl: t(v.onlineUrl) };
  }
  if (has('route')) body.route = routeBody(d.route);
  if (has('milestones')) {
    const m = d.milestones;
    body.milestones = {
      order: m.order, missed: m.missed, completion: { rule: m.completion.rule, n: m.completion.rule === 'atLeast' ? toNum(m.completion.n) : null },
      items: m.items.map((i) => ({
        key: i.key, title: t(i.title), titleHi: t(i.titleHi), summary: t(i.summary), opensAt: fromInput(i.opensAt), coins: toNum(i.coins, 0),
        link: t(i.linkLabel) || t(i.linkRoute) ? { label: t(i.linkLabel), route: t(i.linkRoute) } : null,
        completion: { rule: i.completion.rule, n: i.completion.rule === 'atLeast' ? toNum(i.completion.n) : null },
        tasks: i.tasks.map((k) => ({ key: k.key, kind: k.kind, title: t(k.title), titleHi: t(k.titleHi), config: kindOf(k.kind) ? configBody(kindOf(k.kind).configSchema, k.config) : k.config })),
      })),
    };
  }
  if (has('rewards')) {
    body.rewards = d.rewards.map((r) => ({
      kind: r.kind, coins: r.kind === 'coins' ? toNum(r.coins, 0) : 0, badgeSlug: r.kind === 'badge' ? r.badgeSlug : '',
      trigger: r.on === 'milestone' ? { on: 'milestone', milestoneKey: r.milestoneKey } : { on: 'event' },
    }));
  }
  if (has('content')) {
    const c = d.content;
    body.content = {
      body: c.body, bodyHi: c.bodyHi, gallery: c.gallery.filter(Boolean),
      faq: c.faq.filter((f) => t(f.q) || t(f.a)).map((f) => ({ q: t(f.q), a: t(f.a) })),
      links: c.links.filter((l) => t(l.label) || t(l.route)).map((l) => ({ label: t(l.label), route: t(l.route) })),
    };
  }
  return body;
}

/**
 * Fast checks the API will repeat (it has the final say). Returns the same
 * { 'path.to.field': message } shape as the API's 400 `fields`.
 */
export function validateEvent(d, kinds = []) {
  const e = {};
  const has = (id) => d.blocks.includes(id);
  const kindOf = (k) => kinds.find((x) => x.kind === k);
  if (!t(d.title)) e.title = 'Add a title';
  if (!d.typeSlug) e.typeSlug = 'Choose an event type';
  if (d.published && !has('schedule')) e.blocks = 'A shown event needs a schedule';
  if (has('schedule')) {
    const s = d.schedule;
    if (s.mode !== 'always' && !s.startsAt) e['schedule.startsAt'] = 'Set the start';
    if (s.mode === 'multiday' && !s.endsAt) e['schedule.endsAt'] = 'Set the end';
    if (s.startsAt && s.endsAt && s.mode !== 'always' && s.endsAt < s.startsAt) e['schedule.endsAt'] = 'The end must be after the start';
  }
  if (has('registration')) {
    const r = d.registration;
    if (r.mode === 'coins' && !(Number(r.coins) >= 1)) e['registration.coins'] = 'Set at least 1 coin';
    if (r.capacity !== '' && !(Number(r.capacity) >= 1)) e['registration.capacity'] = 'At least 1, or leave blank for no limit';
    if (r.opensAt && r.closesAt && r.closesAt < r.opensAt) e['registration.closesAt'] = 'Closing must be after opening';
    r.fields.forEach((f, i) => {
      if (!t(f.label)) e[`registration.fields.${i}.label`] = 'Add a label';
      if (f.type === 'choice' && !f.options.map(t).filter(Boolean).length) e[`registration.fields.${i}.options`] = 'Add at least one option';
    });
  }
  if (has('route')) Object.assign(e, routeProblems(d.route));
  if (has('milestones')) {
    const m = d.milestones;
    if (m.items.length > MAX_MILESTONES) e['milestones.items'] = `Up to ${MAX_MILESTONES} milestones`;
    if (m.completion.rule === 'atLeast' && !(Number(m.completion.n) >= 1)) e['milestones.completion.n'] = 'Set N';
    m.items.forEach((i, mi) => {
      const p = `milestones.items.${mi}`;
      if (!t(i.title)) e[`${p}.title`] = 'Add a title';
      if (m.order === 'daily' && !i.opensAt) e[`${p}.opensAt`] = 'Daily milestones need the day they open';
      if (!(Number(i.coins || 0) >= 0)) e[`${p}.coins`] = 'Zero or more';
      if (i.completion.rule === 'atLeast' && !(Number(i.completion.n) >= 1)) e[`${p}.completion.n`] = 'Set N';
      if (i.tasks.length > MAX_TASKS) e[`${p}.tasks`] = `Up to ${MAX_TASKS} tasks`;
      i.tasks.forEach((k, ti) => {
        const tp = `${p}.tasks.${ti}`;
        if (!k.kind) e[`${tp}.kind`] = 'Choose what completes it';
        else if (kinds.length && !kindOf(k.kind)) e[`${tp}.kind`] = 'This task type is no longer available';
        else if (kindOf(k.kind)) {
          const schema = kindOf(k.kind).configSchema;
          // A kind that declares a place (lat + lng) gets the place checks; the registry decides, never the kind's name.
          const extra = isGeoSchema(schema) ? geoProblems(k.config, fieldsOf(schema).map((f) => f.key)) : {};
          Object.entries({ ...extra, ...configProblems(schema, k.config) }).forEach(([f, msg]) => { e[`${tp}.config.${f}`] = extra[f] || msg; });
        }
      });
    });
  }
  if (has('rewards')) {
    d.rewards.forEach((r, i) => {
      if (r.kind === 'coins' && !(Number(r.coins) >= 1)) e[`rewards.${i}.coins`] = 'Set at least 1 coin';
      if (r.kind === 'badge' && !r.badgeSlug) e[`rewards.${i}.badgeSlug`] = 'Choose a badge';
      if (r.on === 'milestone' && !r.milestoneKey) e[`rewards.${i}.milestoneKey`] = 'Choose the milestone';
    });
  }
  return e;
}

/** Reward triggers must point at a milestone that still exists. */
export const milestoneOptions = (d) => d.milestones.items.map((m, i) => ({ value: m.key, label: m.title || `Milestone ${i + 1}` }));

/** Mirror of a preset's defaults, as the editor's starting draft (title and keys untouched). */
export function applyTypeDefaults(draft, type, kinds = []) {
  const base = draftFrom({ ...(type?.defaults || {}), typeSlug: type?.slug || '' }, kinds);
  return {
    ...base, slug: draft.slug, title: draft.title, titleHi: draft.titleHi, summary: draft.summary, summaryHi: draft.summaryHi, cover: draft.cover,
    published: draft.published, language: draft.language, tags: draft.tags, typeSlug: type?.slug || '',
  };
}

export const schemaFieldsOf = fieldsOf;
