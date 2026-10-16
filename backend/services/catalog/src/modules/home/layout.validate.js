/**
 * Strict validation + normalisation of a Home layout document (docs/HOME_LAYOUT.md section 1-3), driven by registry.js.
 *
 * `validateLayout(body)` returns `{ doc }` (the normalised document: every common field present, dates as ISO strings,
 * html sanitised, text trimmed) or `{ fields }` (a map of dotted paths to messages, e.g. `blocks.3.data.source`).
 * Unknown fields are rejected everywhere. It never throws on bad input.
 */
import { withinHtmlLimit, sanitizeHtmlFragment } from './html-sanitizer.js';
import {
  ACTION_TYPES, BADGES, BLOCK_TYPES, ICONS, LANGUAGES, LIMITS, SCHEMA_VERSION, SOURCES, TONES,
} from './registry.js';

const MAX_ERRORS = 60;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const FLAG_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const REF_RE = /^[\w.-]{1,120}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

class Fields {
  constructor() { this.map = {}; this.n = 0; }

  add(path, message) {
    if (this.n >= MAX_ERRORS) return;
    if (!(path in this.map)) this.n += 1;
    this.map[path] ??= message;
  }

  get any() { return this.n > 0; }
}

/** Reject keys that are not in `allowed`. */
function noUnknown(o, allowed, path, f) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) f.add(`${path}.${k}`, 'Unknown field.');
}

function text(v, path, f, { max = LIMITS.text, def = '' } = {}) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'string') { f.add(path, 'Must be text.'); return def; }
  const s = v.trim();
  if (s.length > max) { f.add(path, `At most ${max} characters.`); return def; }
  return s;
}

function bool(v, path, f, def) {
  if (v === undefined) return def;
  if (typeof v !== 'boolean') { f.add(path, 'Must be true or false.'); return def; }
  return v;
}

function oneOf(v, list, path, f, def) {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'string' || !list.includes(v)) { f.add(path, `Must be one of: ${list.map((x) => x || '(empty)').join(', ')}.`); return def; }
  return v;
}

function when(v, path, f) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) { f.add(path, 'Must be an ISO date or null.'); return null; }
  return new Date(v).toISOString();
}

function image(v, path, f) {
  const s = text(v, path, f, { max: 500 });
  if (!s) return '';
  if (/^\/uploads\/[\w.-]+$/.test(s)) return s;
  try { if (new URL(s).protocol === 'https:') return s; } catch { /* below */ }
  f.add(path, 'Must be an /uploads/... path or an https URL.');
  return '';
}

/** `{type, ref}` | null. */
function action(v, path, f) {
  if (v === undefined || v === null) return null;
  if (!isObj(v)) { f.add(path, 'Must be an action object or null.'); return null; }
  noUnknown(v, ['type', 'ref'], path, f);
  if (typeof v.type !== 'string' || !ACTION_TYPES.includes(v.type)) { f.add(`${path}.type`, `Must be one of: ${ACTION_TYPES.join(', ')}.`); return null; }
  const ref = text(v.ref, `${path}.ref`, f, { max: LIMITS.ref });
  if (v.type === 'route' && !(ref.startsWith('/') && !ref.startsWith('//'))) f.add(`${path}.ref`, 'A route must start with a single "/".');
  else if (v.type === 'link') {
    let ok = false;
    try { ok = new URL(ref).protocol === 'https:'; } catch { /* not a URL */ }
    if (!ok) f.add(`${path}.ref`, 'A link must be an https URL.');
  } else if (ref && !['route', 'link', 'none'].includes(v.type) && !REF_RE.test(ref)) f.add(`${path}.ref`, 'Letters, digits, "-", "_" and "." only.');
  return { type: v.type, ref: v.type === 'none' ? '' : ref };
}

const ITEM_KEYS = ['title', 'titleHi', 'subtitle', 'subtitleHi', 'icon', 'image', 'badge', 'liveBadge', 'flag', 'deitySlug', 'action'];

function item(v, path, f) {
  if (!isObj(v)) { f.add(path, 'Each item must be an object.'); return null; }
  noUnknown(v, ITEM_KEYS, path, f);
  return {
    title: text(v.title, `${path}.title`, f), titleHi: text(v.titleHi, `${path}.titleHi`, f),
    subtitle: text(v.subtitle, `${path}.subtitle`, f), subtitleHi: text(v.subtitleHi, `${path}.subtitleHi`, f),
    icon: oneOf(v.icon, ['', ...ICONS], `${path}.icon`, f, ''),
    image: image(v.image, `${path}.image`, f),
    badge: oneOf(v.badge, ['', ...BADGES], `${path}.badge`, f, ''),
    liveBadge: bool(v.liveBadge, `${path}.liveBadge`, f, false),
    flag: flag(v.flag, `${path}.flag`, f),
    deitySlug: text(v.deitySlug, `${path}.deitySlug`, f, { max: 80 }),
    action: action(v.action, `${path}.action`, f),
  };
}

function flag(v, path, f) {
  const s = text(v, path, f, { max: 40 });
  if (s && !FLAG_RE.test(s)) f.add(path, 'A feature-flag key: letters, digits and "_".');
  return s;
}

/** A value against one registry prop / param schema. Returns the cleaned value or `undefined` (invalid; error recorded). */
function typed(v, spec, path, f) {
  switch (spec.type) {
    case 'boolean':
      if (typeof v !== 'boolean') { f.add(path, 'Must be true or false.'); return undefined; }
      return v;
    case 'integer':
      if (!Number.isInteger(v)) { f.add(path, 'Must be a whole number.'); return undefined; }
      if (spec.enum && !spec.enum.includes(v)) { f.add(path, `Must be one of: ${spec.enum.join(', ')}.`); return undefined; }
      if (spec.min !== undefined && v < spec.min) { f.add(path, `At least ${spec.min}.`); return undefined; }
      if (spec.max !== undefined && v > spec.max) { f.add(path, `At most ${spec.max}.`); return undefined; }
      return v;
    case 'html': {
      if (typeof v !== 'string') { f.add(path, 'Must be text (HTML).'); return undefined; }
      if (!withinHtmlLimit(v)) { f.add(path, `HTML is limited to ${LIMITS.html / 1024} KB.`); return undefined; }
      return sanitizeHtmlFragment(v);
    }
    case 'array': {
      if (!Array.isArray(v)) { f.add(path, 'Must be a list.'); return undefined; }
      if (v.length > (spec.maxItems ?? 20)) { f.add(path, `At most ${spec.maxItems ?? 20} entries.`); return undefined; }
      const out = v.map((x, i) => typed(x, spec.items, `${path}.${i}`, f));
      return out.includes(undefined) ? undefined : out;
    }
    default: { // string
      if (typeof v !== 'string') { f.add(path, 'Must be text.'); return undefined; }
      const s = v.trim();
      if (spec.maxLength !== undefined && s.length > spec.maxLength) { f.add(path, `At most ${spec.maxLength} characters.`); return undefined; }
      if (spec.enum && !spec.enum.includes(s)) { f.add(path, `Must be one of: ${spec.enum.join(', ')}.`); return undefined; }
      if (spec.pattern && s && !new RegExp(spec.pattern).test(s)) { f.add(path, 'Contains characters that are not allowed.'); return undefined; }
      return s;
    }
  }
}

/** `props` / source `params`: only the keys the schema names. */
function keyed(v, schema, path, f) {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) { f.add(path, 'Must be an object.'); return {}; }
  noUnknown(v, Object.keys(schema), path, f);
  const out = {};
  for (const [k, spec] of Object.entries(schema)) {
    if (v[k] === undefined) continue;
    const c = typed(v[k], spec, `${path}.${k}`, f);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

function data(v, def, path, f) {
  if (v === undefined || v === null) return null;
  if (!def.modes.length) { f.add(path, 'This block type has no data; it must be null.'); return null; }
  if (!isObj(v)) { f.add(path, 'Must be an object or null.'); return null; }
  if (v.mode !== 'inline' && v.mode !== 'source') { f.add(`${path}.mode`, 'Must be "inline" or "source".'); return null; }
  if (!def.modes.includes(v.mode)) { f.add(`${path}.mode`, `This block type allows: ${def.modes.join(', ')}.`); return null; }

  if (v.mode === 'inline') {
    noUnknown(v, ['mode', 'items'], path, f);
    if (!Array.isArray(v.items)) { f.add(`${path}.items`, 'Must be a list of items.'); return { mode: 'inline', items: [] }; }
    const max = Math.min(def.maxItems ?? LIMITS.items, LIMITS.items);
    if (v.items.length > max) f.add(`${path}.items`, `At most ${max} items.`);
    return { mode: 'inline', items: v.items.slice(0, max).map((x, i) => item(x, `${path}.items.${i}`, f)).filter(Boolean) };
  }

  noUnknown(v, ['mode', 'source', 'params', 'limit'], path, f);
  const src = SOURCES.find((s) => s.key === v.source);
  if (typeof v.source !== 'string' || !src) { f.add(`${path}.source`, 'Not a known source.'); return null; }
  if (!def.sources?.includes(v.source)) { f.add(`${path}.source`, `This block type allows: ${(def.sources ?? []).join(', ')}.`); return null; }
  const out = { mode: 'source', source: v.source, params: keyed(v.params, src.params, `${path}.params`, f) };
  if (v.limit !== undefined && v.limit !== null) {
    if (!Number.isInteger(v.limit) || v.limit < 1 || v.limit > LIMITS.sourceLimitMax) f.add(`${path}.limit`, `A whole number from 1 to ${LIMITS.sourceLimitMax}.`);
    else out.limit = v.limit;
  }
  return out;
}

const BLOCK_KEYS = ['id', 'type', 'enabled', 'startsAt', 'endsAt', 'language', 'flag', 'title', 'titleHi', 'subtitle', 'subtitleHi', 'tone', 'action', 'actionLabel', 'actionLabelHi', 'props', 'data'];

function block(v, i, seen, f) {
  const path = `blocks.${i}`;
  if (!isObj(v)) { f.add(path, 'Each block must be an object.'); return null; }
  noUnknown(v, BLOCK_KEYS, path, f);

  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) f.add(`${path}.id`, 'Required: letters, digits, "-" and "_", at most 40.');
  else if (seen.has(v.id)) f.add(`${path}.id`, 'Duplicate id.');
  else seen.add(v.id);

  const def = typeof v.type === 'string' && Object.hasOwn(BLOCK_TYPES, v.type) ? BLOCK_TYPES[v.type] : null;
  if (!def) f.add(`${path}.type`, `Not a known block type (${Object.keys(BLOCK_TYPES).join(', ')}).`);

  const startsAt = when(v.startsAt, `${path}.startsAt`, f);
  const endsAt = when(v.endsAt, `${path}.endsAt`, f);
  if (startsAt && endsAt && endsAt <= startsAt) f.add(`${path}.endsAt`, 'Must be after startsAt.');

  return {
    id: typeof v.id === 'string' ? v.id : '',
    type: def ? v.type : '',
    enabled: bool(v.enabled, `${path}.enabled`, f, true),
    startsAt, endsAt,
    language: oneOf(v.language, LANGUAGES, `${path}.language`, f, 'all'),
    flag: flag(v.flag, `${path}.flag`, f),
    title: text(v.title, `${path}.title`, f), titleHi: text(v.titleHi, `${path}.titleHi`, f),
    subtitle: text(v.subtitle, `${path}.subtitle`, f), subtitleHi: text(v.subtitleHi, `${path}.subtitleHi`, f),
    tone: oneOf(v.tone, ['', ...TONES], `${path}.tone`, f, ''),
    action: action(v.action, `${path}.action`, f),
    actionLabel: text(v.actionLabel, `${path}.actionLabel`, f), actionLabelHi: text(v.actionLabelHi, `${path}.actionLabelHi`, f),
    props: def ? keyed(v.props, def.props, `${path}.props`, f) : {},
    data: def ? data(v.data, def.data, `${path}.data`, f) : null,
  };
}

export function validateLayout(body) {
  const f = new Fields();
  if (!isObj(body)) { f.add('body', 'Send {schemaVersion, blocks}.'); return { fields: f.map }; }
  noUnknown(body, ['schemaVersion', 'blocks'], '', f);
  // noUnknown prefixes "."; tidy the top-level keys
  for (const k of Object.keys(f.map)) if (k.startsWith('.')) { f.map[k.slice(1)] = f.map[k]; delete f.map[k]; }
  if (body.schemaVersion !== SCHEMA_VERSION) f.add('schemaVersion', `Must be ${SCHEMA_VERSION}.`);
  if (!Array.isArray(body.blocks)) { f.add('blocks', 'Must be a list of blocks.'); return { fields: f.map }; }
  if (body.blocks.length > LIMITS.blocks) f.add('blocks', `At most ${LIMITS.blocks} blocks.`);
  const seen = new Set();
  const blocks = body.blocks.slice(0, LIMITS.blocks).map((b, i) => block(b, i, seen, f));
  if (f.any) return { fields: f.map };
  return { doc: { schemaVersion: SCHEMA_VERSION, blocks } };
}
