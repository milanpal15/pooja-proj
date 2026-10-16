/**
 * Event validation (docs/EVENTS.md section 1). `normalizeEvent` takes the operator's JSON and returns the object to store, or
 * throws HttpError(400, 'bad_event', ..., { fields: { 'milestones.items.2.title': 'message' } }).
 *
 * Structural rules always apply. A DRAFT may still lack a schedule; PUBLISHING (`published:true`) additionally needs the schedule
 * block, and every reference (stream/listing/pooja/temple/aarti via catalog, badge via this service) is checked - if catalog cannot
 * be reached the publish is refused with 503 catalog_unavailable (fail closed), while a draft saves with the references unchecked.
 */
import { HttpError } from '../lib/http-error.js';
import { getKind } from '../tasks/index.js';
import { applyRoute, normalizeRoute } from './route.js';

export const BLOCK_NAMES = ['schedule', 'registration', 'venue', 'milestones', 'rewards', 'content', 'route'];
export const SCHEMA_VERSION = 1;
/** Would collide with app routes (/events/badges ...). */
export const RESERVED_SLUGS = ['badges', 'mine', 'new'];
export const MAX_MILESTONES = 60;
export const MAX_TASKS = 8;

const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-f]{6}$/i;
const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const blank = (v) => v === undefined || v === null || v === '';

export function slugify(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Collects `fields[path] = message` (first message per path wins). */
function collector() {
  const fields = {};
  const add = (path, message) => { if (!(path in fields)) fields[path] = message; };
  return {
    fields,
    add,
    any: () => Object.keys(fields).length > 0,
    str(path, v, { max = 200, required = false } = {}) {
      if (blank(v)) { if (required) add(path, 'Required.'); return ''; }
      if (typeof v !== 'string') { add(path, 'Must be text.'); return ''; }
      const s = v.trim();
      if (s.length > max) { add(path, `Too long (max ${max}).`); return s.slice(0, max); }
      if (required && !s) add(path, 'Required.');
      return s;
    },
    int(path, v, { min = 0, max = 1_000_000, nullable = false, def = 0 } = {}) {
      if (blank(v)) return nullable ? null : def;
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (!Number.isInteger(n)) { add(path, 'Must be a whole number.'); return nullable ? null : def; }
      if (n < min) { add(path, `Must be at least ${min}.`); return nullable ? null : def; }
      if (n > max) { add(path, `Must be at most ${max}.`); return nullable ? null : def; }
      return n;
    },
    date(path, v) {
      if (blank(v)) return null;
      const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) { add(path, 'Must be a valid date and time.'); return null; }
      return d;
    },
    bool(path, v, def) {
      if (v === undefined || v === null) return def;
      if (typeof v !== 'boolean') { add(path, 'Must be true or false.'); return def; }
      return v;
    },
    oneOf(path, v, allowed, def) {
      if (blank(v)) return def;
      if (!allowed.includes(v)) { add(path, `Must be one of: ${allowed.join(', ')}.`); return def; }
      return v;
    },
    hex(path, v) {
      if (blank(v)) return '';
      if (typeof v !== 'string' || !HEX.test(v.trim())) { add(path, 'Must be a colour like #7A1F2B.'); return ''; }
      return v.trim();
    },
    route(path, v) {
      if (blank(v)) return '';
      if (typeof v !== 'string' || v.length > 300 || !/^(\/|bhakti:\/\/|https:\/\/)/.test(v.trim())) { add(path, 'Must be an in-app route (/...), bhakti://... or an https link.'); return ''; }
      return v.trim();
    },
    media(path, v) {
      if (blank(v)) return '';
      if (typeof v !== 'string' || v.length > 500 || !/^(\/uploads\/|https:\/\/)/.test(v.trim())) { add(path, 'Must be an uploaded file (/uploads/...) or an https link.'); return ''; }
      return v.trim();
    },
  };
}

function normaliseGradient(c, path, v) {
  if (blank(v)) return undefined;
  if (!Array.isArray(v) || v.length !== 2) { c.add(path, 'Must be two colours.'); return undefined; }
  const g = v.map((x, i) => c.hex(`${path}.${i}`, x));
  return g.every(Boolean) ? g : undefined;
}

/** Fixed order of the blocks when the operator does not give one. */
const inferBlocks = (input) => BLOCK_NAMES.filter((b) => input[b] !== undefined && input[b] !== null);

function schedule(c, v, publishing) {
  if (!isObj(v)) { c.add('schedule', 'The schedule block must be an object.'); return undefined; }
  const mode = c.oneOf('schedule.mode', v.mode, ['single', 'multiday', 'always'], 'single');
  const startsAt = c.date('schedule.startsAt', v.startsAt);
  const endsAt = c.date('schedule.endsAt', v.endsAt);
  if (mode !== 'always' && !startsAt && publishing) c.add('schedule.startsAt', 'A start time is required.');
  if (mode === 'multiday' && !endsAt) c.add('schedule.endsAt', 'A multi-day event needs an end time.');
  if (startsAt && endsAt && endsAt < startsAt) c.add('schedule.endsAt', 'The end must not be before the start.');
  return { mode, startsAt, endsAt };
}

function registration(c, v) {
  if (!isObj(v)) { c.add('registration', 'The registration block must be an object.'); return undefined; }
  const mode = c.oneOf('registration.mode', v.mode, ['none', 'free', 'coins'], 'free');
  let coins = c.int('registration.coins', v.coins, { min: 0, max: 100000 });
  if (mode === 'coins' && coins < 1) c.add('registration.coins', 'A paid event needs at least 1 coin.');
  if (mode !== 'coins') coins = 0;
  const capacity = c.int('registration.capacity', v.capacity, { min: 1, max: 1_000_000, nullable: true });
  const opensAt = c.date('registration.opensAt', v.opensAt);
  const closesAt = c.date('registration.closesAt', v.closesAt);
  if (opensAt && closesAt && closesAt < opensAt) c.add('registration.closesAt', 'Registration cannot close before it opens.');
  const pass = c.bool('registration.pass', v.pass, true);
  let fields = [];
  if (v.fields !== undefined && v.fields !== null) {
    if (!Array.isArray(v.fields)) c.add('registration.fields', 'Must be a list.');
    else if (v.fields.length > 20) c.add('registration.fields', 'At most 20 fields.');
    else {
      const seen = new Set();
      fields = v.fields.map((f, i) => {
        const p = `registration.fields.${i}`;
        if (!isObj(f)) { c.add(p, 'Must be an object.'); return null; }
        const key = c.str(`${p}.key`, f.key, { max: 40, required: true });
        if (key && !FIELD_KEY.test(key)) c.add(`${p}.key`, 'Use letters, digits and _ , starting with a letter.');
        if (key && seen.has(key)) c.add(`${p}.key`, 'Duplicate field key.');
        seen.add(key);
        const type = c.oneOf(`${p}.type`, f.type, ['text', 'choice', 'number'], 'text');
        let options = [];
        if (type === 'choice') {
          if (!Array.isArray(f.options) || f.options.length < 2 || f.options.length > 30 || f.options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 80)) {
            c.add(`${p}.options`, 'A choice needs 2 to 30 non-empty options.');
          } else options = f.options.map((o) => o.trim());
        }
        return {
          key, label: c.str(`${p}.label`, f.label, { max: 120, required: true }), labelHi: c.str(`${p}.labelHi`, f.labelHi, { max: 120 }),
          type, required: c.bool(`${p}.required`, f.required, false), options,
        };
      }).filter(Boolean);
    }
  }
  return { mode, coins, capacity, opensAt, closesAt, pass, fields };
}

function venue(c, v, refs) {
  if (!isObj(v)) { c.add('venue', 'The venue block must be an object.'); return undefined; }
  const num = (path, x, min, max) => {
    if (blank(x)) return null;
    const n = typeof x === 'string' ? Number(x) : x;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) { c.add(path, `Must be a number from ${min} to ${max}.`); return null; }
    return n;
  };
  const lat = num('venue.lat', v.lat, -90, 90);
  const lng = num('venue.lng', v.lng, -180, 180);
  if ((lat === null) !== (lng === null)) c.add(lat === null ? 'venue.lat' : 'venue.lng', 'Give both latitude and longitude, or neither.');
  const onlineUrl = c.str('venue.onlineUrl', v.onlineUrl, { max: 500 });
  if (onlineUrl && !/^https:\/\//.test(onlineUrl)) c.add('venue.onlineUrl', 'Must be an https link.');
  const templeSlug = c.str('venue.templeSlug', v.templeSlug, { max: 80 });
  if (templeSlug) {
    if (!SLUG.test(templeSlug)) c.add('venue.templeSlug', 'Not a valid temple slug.');
    else refs.push({ type: 'temple', slug: templeSlug, path: 'venue.templeSlug' });
  }
  const out = {
    name: c.str('venue.name', v.name, { max: 160 }), city: c.str('venue.city', v.city, { max: 80 }), address: c.str('venue.address', v.address, { max: 300 }),
    lat, lng, organiser: c.str('venue.organiser', v.organiser, { max: 120 }), onlineUrl, templeSlug,
  };
  if (!out.name && !out.onlineUrl) c.add('venue.name', 'Give a venue name or an online link.');
  return out;
}

function completionRule(c, path, v, count) {
  const src = isObj(v) ? v : {};
  const rule = c.oneOf(`${path}.rule`, src.rule, ['all', 'atLeast', 'any'], 'all');
  let n = null;
  if (rule === 'atLeast') {
    n = c.int(`${path}.n`, src.n, { min: 1, max: 1000, nullable: true });
    if (n === null) c.add(`${path}.n`, 'Say how many.');
    else if (count !== null && n > count) c.add(`${path}.n`, `Cannot be more than the ${count} available.`);
  }
  return { rule, n };
}

function tasks(c, mPath, list, refs) {
  if (!Array.isArray(list) || list.length < 1) { c.add(`${mPath}.tasks`, 'A milestone needs at least one task.'); return []; }
  if (list.length > MAX_TASKS) { c.add(`${mPath}.tasks`, `At most ${MAX_TASKS} tasks per milestone.`); return []; }
  const used = new Set(list.map((t) => (isObj(t) && typeof t.key === 'string' ? t.key.trim() : '')).filter(Boolean));
  let next = 1;
  const seen = new Set();
  return list.map((t, i) => {
    const p = `${mPath}.tasks.${i}`;
    if (!isObj(t)) { c.add(p, 'Must be an object.'); return null; }
    let key = c.str(`${p}.key`, t.key, { max: 40 });
    if (!key) { while (used.has(`t${next}`)) next += 1; key = `t${next}`; used.add(key); }
    if (!KEY.test(key)) c.add(`${p}.key`, 'Use letters, digits, - or _ (up to 40).');
    if (seen.has(key)) c.add(`${p}.key`, 'Duplicate task key.');
    seen.add(key);
    const kind = getKind(t.kind);
    if (!kind) { c.add(`${p}.kind`, blank(t.kind) ? 'Required.' : `Unknown task kind "${t.kind}".`); return { key, kind: String(t.kind ?? ''), title: c.str(`${p}.title`, t.title, { max: 160 }), titleHi: c.str(`${p}.titleHi`, t.titleHi, { max: 160 }), config: {} }; }
    const res = kind.validate(isObj(t.config) || blank(t.config) ? t.config : (c.add(`${p}.config`, 'Must be an object.'), {}), {});
    for (const e of res.errors) c.add(`${p}.config${e.field ? `.${e.field}` : ''}`, e.message);
    for (const r of res.refs) refs.push({ type: r.type, slug: r.slug, path: `${p}.config.${r.field}` });
    return { key, kind: kind.kind, title: c.str(`${p}.title`, t.title, { max: 160 }) || kind.summary(res.config, 'en'), titleHi: c.str(`${p}.titleHi`, t.titleHi, { max: 160 }), config: res.config };
  }).filter(Boolean);
}

function milestones(c, v, retired, refs) {
  if (!isObj(v)) { c.add('milestones', 'The milestones block must be an object.'); return undefined; }
  const ord = c.oneOf('milestones.order', v.order, ['daily', 'sequential', 'any'], 'any');
  const missed = c.oneOf('milestones.missed', v.missed, ['catch_up_next', 'lock_at_end', 'catch_up_any'], 'catch_up_next');
  const list = v.items;
  if (!Array.isArray(list) || list.length < 1) { c.add('milestones.items', 'Add at least one milestone.'); return { order: ord, missed, completion: { rule: 'all', n: null }, items: [] }; }
  if (list.length > MAX_MILESTONES) { c.add('milestones.items', `At most ${MAX_MILESTONES} milestones.`); }
  const used = new Set(list.map((m) => (isObj(m) && typeof m.key === 'string' ? m.key.trim() : '')).filter(Boolean));
  let next = 1;
  const seen = new Set();
  const items = list.slice(0, MAX_MILESTONES).map((m, i) => {
    const p = `milestones.items.${i}`;
    if (!isObj(m)) { c.add(p, 'Must be an object.'); return null; }
    let key = c.str(`${p}.key`, m.key, { max: 40 });
    if (!key) { while (used.has(`m${next}`) || retired.has(`m${next}`)) next += 1; key = `m${next}`; used.add(key); }
    if (!KEY.test(key)) c.add(`${p}.key`, 'Use letters, digits, - or _ (up to 40).');
    if (seen.has(key)) c.add(`${p}.key`, 'Duplicate milestone key.');
    seen.add(key);
    if (retired.has(key)) c.add(`${p}.key`, 'That key was used by a milestone that was removed; keys are never reused.');
    const opensAt = c.date(`${p}.opensAt`, m.opensAt);
    if (ord === 'daily' && !opensAt) c.add(`${p}.opensAt`, 'A daily event needs the day each milestone opens.');
    let link = null;
    if (isObj(m.link)) {
      const route = c.route(`${p}.link.route`, m.link.route);
      const label = c.str(`${p}.link.label`, m.link.label, { max: 80 });
      if (route || label) {
        if (!route) c.add(`${p}.link.route`, 'Required.');
        link = { label, route };
      }
    } else if (!blank(m.link)) c.add(`${p}.link`, 'Must be an object or empty.');
    const ts = tasks(c, p, m.tasks, refs);
    return {
      key, title: c.str(`${p}.title`, m.title, { max: 160, required: true }), titleHi: c.str(`${p}.titleHi`, m.titleHi, { max: 160 }),
      summary: c.str(`${p}.summary`, m.summary, { max: 400 }), summaryHi: c.str(`${p}.summaryHi`, m.summaryHi, { max: 400 }),
      opensAt, coins: c.int(`${p}.coins`, m.coins, { min: 0, max: 100000 }), link,
      completion: completionRule(c, `${p}.completion`, m.completion, ts.length), tasks: ts,
    };
  }).filter(Boolean);
  return { order: ord, missed, completion: completionRule(c, 'milestones.completion', v.completion, items.length), items };
}

function rewards(c, v, msKeys, refs) {
  if (!Array.isArray(v)) { c.add('rewards', 'The rewards block must be a list.'); return undefined; }
  if (v.length > 30) { c.add('rewards', 'At most 30 rewards.'); return []; }
  return v.map((r, i) => {
    const p = `rewards.${i}`;
    if (!isObj(r)) { c.add(p, 'Must be an object.'); return null; }
    const kind = c.oneOf(`${p}.kind`, r.kind, ['coins', 'badge', 'certificate'], null);
    if (!kind) { c.add(`${p}.kind`, 'Must be one of: coins, badge, certificate.'); return null; }
    const coins = kind === 'coins' ? c.int(`${p}.coins`, r.coins, { min: 1, max: 100000 }) : 0;
    if (kind === 'coins' && !(coins >= 1)) c.add(`${p}.coins`, 'At least 1 coin.');
    let badgeSlug = '';
    if (kind === 'badge') {
      badgeSlug = c.str(`${p}.badgeSlug`, r.badgeSlug, { max: 80, required: true });
      if (badgeSlug) refs.push({ type: 'badge', slug: badgeSlug, path: `${p}.badgeSlug` });
    }
    const t = isObj(r.trigger) ? r.trigger : {};
    const on = c.oneOf(`${p}.trigger.on`, t.on, ['milestone', 'event'], 'event');
    let milestoneKey = '';
    if (on === 'milestone') {
      milestoneKey = c.str(`${p}.trigger.milestoneKey`, t.milestoneKey, { max: 40, required: true });
      if (milestoneKey && msKeys && !msKeys.has(milestoneKey)) c.add(`${p}.trigger.milestoneKey`, 'No milestone has that key.');
      if (milestoneKey && !msKeys) c.add(`${p}.trigger.milestoneKey`, 'The event has no milestones block.');
    }
    return { kind, coins, badgeSlug, trigger: { on, milestoneKey } };
  }).filter(Boolean);
}

function content(c, v) {
  if (!isObj(v)) { c.add('content', 'The content block must be an object.'); return undefined; }
  const list = (path, x, max, f) => {
    if (blank(x)) return [];
    if (!Array.isArray(x) || x.length > max) { c.add(path, `Must be a list of at most ${max}.`); return []; }
    return x.map((y, i) => f(`${path}.${i}`, y)).filter(Boolean);
  };
  return {
    body: c.str('content.body', v.body, { max: 20000 }), bodyHi: c.str('content.bodyHi', v.bodyHi, { max: 20000 }),
    gallery: list('content.gallery', v.gallery, 20, (p, y) => c.media(p, y) || null),
    faq: list('content.faq', v.faq, 30, (p, y) => (isObj(y) ? { q: c.str(`${p}.q`, y.q, { max: 300, required: true }), a: c.str(`${p}.a`, y.a, { max: 3000, required: true }) } : (c.add(p, 'Must be an object.'), null))),
    links: list('content.links', v.links, 12, (p, y) => (isObj(y) ? { label: c.str(`${p}.label`, y.label, { max: 80, required: true }), route: c.route(`${p}.route`, y.route) || (c.add(`${p}.route`, 'Required.'), '') } : (c.add(p, 'Must be an object.'), null))),
  };
}

/**
 * @param {object} input     the request body, already merged over the stored event on an update
 * @param {object} deps
 * @param {{typeExists:(slug:string)=>Promise<boolean>, badgeSlugs:(slugs:string[])=>Promise<Set<string>>, catalog:{exists:(type:string,slug:string)=>Promise<boolean>}}} deps.lookups
 * @param {string[]} [deps.retiredKeys]  milestone keys removed from this event earlier
 * @param {object[]} [deps.warnings]  filled with `{path, code, ...}` warnings (saved anyway), e.g. a stop far from the route path
 * @returns {Promise<object>} the fields to store (no slug, no retiredKeys bookkeeping)
 */
export async function normalizeEvent(input, { lookups, retiredKeys = [], warnings } = {}) {
  const c = collector();
  if (!isObj(input)) throw new HttpError(400, 'bad_event', 'The event must be a JSON object.', { fields: { '': 'Must be an object.' } });
  const published = c.bool('published', input.published, false);
  const refs = [];
  const retired = new Set(retiredKeys);

  const title = c.str('title', input.title, { max: 160, required: true });
  const typeSlug = c.str('typeSlug', input.typeSlug, { max: 80, required: true });
  let tags = [];
  if (!blank(input.tags)) {
    if (!Array.isArray(input.tags) || input.tags.length > 12) c.add('tags', 'At most 12 tags.');
    else {
      tags = [...new Set(input.tags.map((t) => slugify(t)).filter(Boolean))];
      if (tags.some((t) => t.length > 40)) c.add('tags', 'A tag is too long.');
    }
  }
  const themeIn = isObj(input.theme) ? input.theme : null;
  if (!blank(input.theme) && !themeIn) c.add('theme', 'Must be an object.');
  let theme = null;
  if (themeIn) {
    const color = c.hex('theme.color', themeIn.color);
    const gradient = normaliseGradient(c, 'theme.gradient', themeIn.gradient);
    if (color || gradient) theme = { ...(color ? { color } : {}), ...(gradient ? { gradient } : {}) };
  }

  let blocks;
  if (blank(input.blocks)) blocks = inferBlocks(input);
  else if (!Array.isArray(input.blocks)) { c.add('blocks', 'Must be a list of block names.'); blocks = []; }
  else {
    blocks = [...new Set(input.blocks)];
    for (const b of blocks) {
      if (!BLOCK_NAMES.includes(b)) c.add('blocks', `Unknown block "${b}".`);
      else if (input[b] === undefined || input[b] === null) c.add(b, `The "${b}" block is listed but has no content.`);
    }
    blocks = blocks.filter((b) => BLOCK_NAMES.includes(b));
  }
  const has = (b) => blocks.includes(b);
  if (published && !has('schedule')) c.add('schedule', 'A published event needs a schedule.');

  const out = {
    schemaVersion: SCHEMA_VERSION,
    typeSlug, tags, title, titleHi: c.str('titleHi', input.titleHi, { max: 160 }),
    summary: c.str('summary', input.summary, { max: 600 }), summaryHi: c.str('summaryHi', input.summaryHi, { max: 600 }),
    cover: c.media('cover', input.cover), language: c.oneOf('language', input.language, ['all', 'en', 'hi'], 'all'),
    theme, published, seriesId: null, blocks,
    schedule: undefined, registration: undefined, venue: undefined, milestones: undefined, rewards: undefined, content: undefined, route: undefined,
  };
  if (has('schedule')) out.schedule = schedule(c, input.schedule, published);
  if (has('registration')) out.registration = registration(c, input.registration);
  if (has('venue')) out.venue = venue(c, input.venue, refs);
  if (has('milestones')) out.milestones = milestones(c, input.milestones, retired, refs);
  if (has('rewards')) out.rewards = rewards(c, input.rewards, out.milestones ? new Set(out.milestones.items.map((m) => m.key)) : null, refs);
  if (has('content')) out.content = content(c, input.content);
  if (has('route')) out.route = normalizeRoute(c, input.route);
  out.startsAt = out.schedule?.startsAt ?? null;

  // Rewards triggered by a milestone must name a milestone of this event even when the milestones block is absent: reported above.
  if (typeSlug && lookups && !(await lookups.typeExists(typeSlug))) c.add('typeSlug', `No event type "${typeSlug}".`);

  if (c.any()) throw new HttpError(400, 'bad_event', 'This event has problems that need fixing.', { fields: c.fields });
  // Figures computed from the route (never edited by hand): each location stop's distance along the path and from it.
  applyRoute(out.milestones, out.route, warnings);

  // References. Badges are ours; the rest are catalog's (fail closed when publishing).
  const badgeRefs = refs.filter((r) => r.type === 'badge');
  if (badgeRefs.length && lookups) {
    const have = await lookups.badgeSlugs([...new Set(badgeRefs.map((r) => r.slug))]);
    for (const r of badgeRefs) if (!have.has(r.slug)) c.add(r.path, `No badge "${r.slug}".`);
  }
  const catalogRefs = refs.filter((r) => r.type !== 'badge');
  if (catalogRefs.length && lookups?.catalog) {
    const cache = new Map();
    try {
      for (const r of catalogRefs) {
        const k = `${r.type}:${r.slug}`;
        if (!cache.has(k)) cache.set(k, await lookups.catalog.exists(r.type, r.slug));
        if (!cache.get(k)) c.add(r.path, `No ${r.type} "${r.slug}" in the catalog.`);
      }
    } catch (e) {
      if (e?.name !== 'CatalogUnavailable') throw e;
      if (published) throw new HttpError(503, 'catalog_unavailable', 'The catalog cannot be reached, so the references in this event cannot be checked. Try publishing again in a moment.');
    }
  }
  if (c.any()) throw new HttpError(400, 'bad_event', 'This event has problems that need fixing.', { fields: c.fields });
  return out;
}
