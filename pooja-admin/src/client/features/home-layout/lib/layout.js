/**
 * Pure rules for the Home layout SET (docs/HOME_LAYOUT.md §9): layouts, ids,
 * blank blocks and items, reorder / duplicate / remove, the cleaned body that
 * is sent, and the warnings about a draft. No React, no fetching. Nothing here
 * branches on a block type's name: a type is whatever the registry says (the
 * leading "fixed" blocks are the registry's `fixed: true` types).
 */
import { defaultMode, modesOf, schemaBody, schemaDefaults, sourcesOf } from './registry.js';

export const SCHEMA_VERSION = 2;
export const DEFAULT_ID = 'default';
export const MAX_LAYOUTS = 8;
export const MAX_BLOCKS = 60;
export const MAX_ITEMS = 24;
export const BADGES = ['', 'new', 'soon', 'special'];
export const LANGUAGES = [
  { value: 'all', label: 'All languages' },
  { value: 'en', label: 'English only' },
  { value: 'hi', label: 'Hindi only' },
];

export const LAYOUT_KEYS = ['id', 'name', 'enabled', 'audience', 'startsAt', 'endsAt', 'blocks'];
export const COMMON_KEYS = ['id', 'type', 'enabled', 'audience', 'startsAt', 'endsAt', 'language', 'flag', 'title', 'titleHi', 'subtitle', 'subtitleHi', 'tone', 'action', 'actionLabel', 'actionLabelHi', 'props', 'data'];
export const ITEM_KEYS = ['title', 'titleHi', 'subtitle', 'subtitleHi', 'icon', 'image', 'badge', 'badgeUntil', 'liveBadge', 'enabled', 'flag', 'deitySlug', 'action'];

/* -------------------------------------------------------------------- ids -- */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `b-xxxx`, not in `taken` (a Set or array of ids, including ones removed this session). */
export function newId(taken = [], rng = Math.random) {
  const used = new Set(taken);
  for (let n = 0; n < 1000; n += 1) {
    let id = 'b-';
    for (let i = 0; i < 4; i += 1) id += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    if (!used.has(id)) return id;
  }
  throw new Error('Could not generate a block id');
}
export const idsOf = (blocks) => (blocks || []).map((b) => b.id);
/** Every block id in every layout (a new block id is unique across the whole set). */
export const allBlockIds = (doc) => (doc?.layouts || []).flatMap((l) => idsOf(l.blocks));

/** A layout id (slug) from its name, not in `taken`. */
export function layoutIdFor(name, taken = []) {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'layout';
  const used = new Set(taken);
  if (!used.has(base) && base !== DEFAULT_ID) return base;
  for (let n = 2; n < 1000; n += 1) {
    const id = `${base}-${n}`;
    if (!used.has(id)) return id;
  }
  throw new Error('Could not generate a layout id');
}

/* ----------------------------------------------------------------- blanks -- */
export const blankItem = () => ({ title: '', titleHi: '', subtitle: '', subtitleHi: '', icon: '', image: '', badge: '', badgeUntil: null, liveBadge: false, enabled: true, flag: '', deitySlug: '', action: null });

/** The data a block of `type` starts with in `mode`. null when the type holds none. */
export function blankData(type, mode, reg) {
  if (!mode || !modesOf(type).includes(mode)) return null;
  if (mode === 'inline') return { mode: 'inline', items: [] };
  const first = sourcesOf(type, reg)[0];
  return { mode: 'source', source: first?.key || '', params: schemaDefaults(first?.params), limit: null };
}

export function blankBlock(type, reg, taken, rng) {
  return {
    id: newId(taken, rng),
    type: type.type,
    enabled: true,
    audience: [],
    startsAt: null,
    endsAt: null,
    language: 'all',
    flag: '',
    title: '',
    titleHi: '',
    subtitle: '',
    subtitleHi: '',
    tone: '',
    action: null,
    actionLabel: '',
    actionLabelHi: '',
    props: schemaDefaults(type.props),
    data: blankData(type, defaultMode(type), reg),
  };
}

/* ------------------------------------------------------------ block edits -- */
/** How many leading blocks are fixed (the registry's `fixed` types): the "Top bar and search" row. */
export function fixedCount(blocks, reg) {
  let n = 0;
  while (n < (blocks || []).length && reg?.typeMap?.[blocks[n].type]?.fixed) n += 1;
  return n;
}

const idx = (blocks, id) => blocks.findIndex((b) => b.id === id);

/** Move item `from` so it ends at index `to` (the result's index). A new array; the same one when nothing moves. */
export function reorder(list, from, to) {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * Where a dragged item lands: dropping on row `over` places it before it (`after` false) or after it (true).
 * -> its final index in the reordered list.
 */
export function dropIndex(from, over, after) {
  let to = over + (after ? 1 : 0);
  if (from < to) to -= 1;
  return to;
}

/** ↑/↓ by `delta`; the fixed prefix can neither move nor be passed. */
export function moveBlock(blocks, id, delta, fixed = 0) {
  const i = idx(blocks, id);
  const j = i + delta;
  if (i < fixed || j < fixed || j >= blocks.length) return blocks;
  return reorder(blocks, i, j);
}

/** Drag: block `id` to final index `to` (never into the fixed prefix). */
export function moveBlockTo(blocks, id, to, fixed = 0) {
  const i = idx(blocks, id);
  if (i < fixed) return blocks;
  return reorder(blocks, i, Math.max(fixed, to));
}

export function insertBlock(blocks, block, afterId, fixed = 0) {
  const i = idx(blocks, afterId);
  const at = i < 0 ? blocks.length : i + 1;
  const pos = Math.max(at, fixed);
  return [...blocks.slice(0, pos), block, ...blocks.slice(pos)];
}

/** A deep copy of a block placed right after it, with a fresh id. A fixed block cannot be duplicated. */
export function duplicateBlock(blocks, id, taken, rng, fixed = 0) {
  const i = idx(blocks, id);
  if (i < 0 || i < fixed) return { blocks, id: null };
  const copy = { ...JSON.parse(JSON.stringify(blocks[i])), id: newId([...idsOf(blocks), ...taken], rng) };
  return { blocks: [...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)], id: copy.id };
}

export const removeBlock = (blocks, id, fixed = 0) => (idx(blocks, id) < fixed ? blocks : blocks.filter((b) => b.id !== id));
export const patchBlock = (blocks, id, patch) => blocks.map((b) => (b.id === id ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b));

/** Where selection goes after `id` is removed: the block now in its place, else the one before. */
export function selectionAfterRemove(blocks, id) {
  const i = idx(blocks, id);
  const rest = blocks.filter((b) => b.id !== id);
  return rest[Math.min(i, rest.length - 1)]?.id ?? null;
}

/* ----------------------------------------------------------- layout edits -- */
export const findLayout = (doc, id) => (doc?.layouts || []).find((l) => l.id === id) || null;
export const isDefault = (l) => l?.id === DEFAULT_ID;
const setLayouts = (doc, layouts) => ({ ...doc, layouts });

export const patchLayout = (doc, id, patch) => setLayouts(doc, doc.layouts.map((l) => (l.id === id ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)));

export const mapBlocks = (doc, layoutId, fn) => patchLayout(doc, layoutId, (l) => ({ blocks: fn(l.blocks) }));

/** The default layout first, then the others in priority order: what the tabs show. */
export function orderedLayouts(doc) {
  const ls = doc?.layouts || [];
  return [...ls.filter(isDefault), ...ls.filter((l) => !isDefault(l))];
}

/** A new layout appended at the end of the priority order. */
export function addLayout(doc, layout) {
  return setLayouts(doc, [...doc.layouts, layout]);
}

export function removeLayout(doc, id) {
  if (id === DEFAULT_ID) return doc;
  return setLayouts(doc, doc.layouts.filter((l) => l.id !== id));
}

/** Priority: swap with the neighbouring NON-default layout. The default is the fallback and never moves. */
export function moveLayout(doc, id, delta) {
  if (id === DEFAULT_ID) return doc;
  const others = doc.layouts.filter((l) => !isDefault(l));
  const i = others.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= others.length) return doc;
  const moved = reorder(others, i, j);
  let k = 0;
  return setLayouts(doc, doc.layouts.map((l) => (isDefault(l) ? l : moved[k++])));
}

/** True when `id` can move by `delta` among the non-default layouts. */
export function canMoveLayout(doc, id, delta) {
  if (id === DEFAULT_ID) return false;
  const others = doc.layouts.filter((l) => !isDefault(l));
  const j = others.findIndex((l) => l.id === id) + delta;
  return j >= 0 && j < others.length;
}

/** A deep copy of a layout under a new id and name. Switched off schedule/audience are NOT copied: a copy must not go live by accident. */
export function copyLayout(source, { id, name, enabled = true, audience = [], startsAt = null, endsAt = null }) {
  const blocks = JSON.parse(JSON.stringify(source?.blocks || []));
  return { id, name, enabled, audience, startsAt, endsAt, blocks };
}

/** The fixed top blocks of `source`, as the start of a blank layout. */
export function blankLayoutBlocks(source, reg) {
  const blocks = source?.blocks || [];
  return JSON.parse(JSON.stringify(blocks.slice(0, fixedCount(blocks, reg))));
}

/* ------------------------------------------------------------ upgrading -- */
const defaultLayoutOf = (blocks) => ({ id: DEFAULT_ID, name: 'Default layout', enabled: true, audience: [], startsAt: null, endsAt: null, blocks });

/** Any stored/pasted document -> a v2 set. A v1 `{blocks}` is wrapped as the default layout. */
export function normaliseDoc(raw) {
  if (raw && Array.isArray(raw.layouts)) return { schemaVersion: SCHEMA_VERSION, layouts: raw.layouts.map((l) => ({ ...l, audience: l.audience || [], blocks: Array.isArray(l.blocks) ? l.blocks : [] })) };
  if (raw && Array.isArray(raw.blocks)) return { schemaVersion: SCHEMA_VERSION, layouts: [defaultLayoutOf(raw.blocks)] };
  return { schemaVersion: SCHEMA_VERSION, layouts: [defaultLayoutOf([])] };
}

/* ------------------------------------------------------------ sending -- */
const text = (v) => (v == null ? '' : String(v));
const isoOrNull = (v) => (v ? String(v) : null);
const strings = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

function cleanAction(a) {
  if (!a || typeof a !== 'object' || !a.type) return null;
  return { type: a.type, ref: text(a.ref).trim() };
}

function cleanItem(it) {
  const i = it && typeof it === 'object' ? it : {};
  return {
    title: text(i.title), titleHi: text(i.titleHi), subtitle: text(i.subtitle), subtitleHi: text(i.subtitleHi),
    icon: text(i.icon), image: text(i.image), badge: BADGES.includes(i.badge) ? i.badge : '', badgeUntil: isoOrNull(i.badgeUntil), liveBadge: !!i.liveBadge, enabled: i.enabled !== false,
    flag: text(i.flag), deitySlug: text(i.deitySlug), action: cleanAction(i.action),
  };
}

function cleanData(data, type, reg) {
  if (!data || typeof data !== 'object') return null;
  if (data.mode === 'source') {
    const src = reg?.sourceMap?.[data.source];
    const out = { mode: 'source', source: text(data.source), params: src?.params ? schemaBody(src.params, data.params || {}) : data.params && typeof data.params === 'object' ? data.params : {} };
    const n = Number(data.limit);
    if (data.limit !== '' && data.limit != null && Number.isFinite(n)) out.limit = n;
    return out;
  }
  return { mode: 'inline', items: (Array.isArray(data.items) ? data.items : []).map(cleanItem) };
}

/** One block as the API takes it: exactly the contract's keys, props cleaned by the type's schema. */
export function cleanBlock(b, reg) {
  const type = reg?.typeMap?.[b.type];
  return {
    id: text(b.id), type: text(b.type), enabled: b.enabled !== false, audience: strings(b.audience),
    startsAt: isoOrNull(b.startsAt), endsAt: isoOrNull(b.endsAt),
    language: ['en', 'hi'].includes(b.language) ? b.language : 'all', flag: text(b.flag),
    title: text(b.title), titleHi: text(b.titleHi), subtitle: text(b.subtitle), subtitleHi: text(b.subtitleHi),
    tone: text(b.tone), action: cleanAction(b.action), actionLabel: text(b.actionLabel), actionLabelHi: text(b.actionLabelHi),
    props: type?.props ? schemaBody(type.props, b.props || {}) : b.props && typeof b.props === 'object' ? b.props : {},
    data: cleanData(b.data, type, reg),
  };
}

export function cleanLayout(l, reg) {
  return {
    id: text(l.id), name: text(l.name).trim(), enabled: l.enabled !== false, audience: strings(l.audience),
    startsAt: isoOrNull(l.startsAt), endsAt: isoOrNull(l.endsAt),
    blocks: (Array.isArray(l.blocks) ? l.blocks : []).map((b) => cleanBlock(b, reg)),
  };
}

export const toBody = (doc, reg) => ({ schemaVersion: SCHEMA_VERSION, layouts: (doc?.layouts || []).map((l) => cleanLayout(l, reg)) });

/** A stable string for "has this changed?" (key order of a cleaned body is fixed). */
export const fingerprint = (doc, reg) => JSON.stringify(toBody(doc, reg));

/* --------------------------------------------------------------- warnings -- */
/** Plain-language warnings about a draft that is valid but probably not intended. */
export function warnings(doc, reg) {
  const out = [];
  const layouts = doc?.layouts || [];
  if (!layouts.some(isDefault)) out.push('There is no default layout; the app needs one to fall back to.');
  if (layouts.length > MAX_LAYOUTS) out.push(`The draft has ${layouts.length} layouts; at most ${MAX_LAYOUTS} are accepted.`);
  for (const l of layouts) {
    const blocks = l.blocks || [];
    const where = layouts.length > 1 ? `“${l.name}”: ` : '';
    if (blocks.length === 0) out.push(`${where}the layout has no sections; the phone would show an empty Home.`);
    if (blocks.length > MAX_BLOCKS) out.push(`${where}${blocks.length} sections; at most ${MAX_BLOCKS} are accepted.`);
    const fixed = fixedCount(blocks, reg);
    const wanted = (reg?.types || []).filter((t) => t.fixed).length;
    if (wanted && fixed < wanted) out.push(`${where}the top bar and search must be the first two sections.`);
    const seen = new Set();
    for (const b of blocks) {
      if (seen.has(b.id)) out.push(`${where}two sections share the id “${b.id}”.`);
      seen.add(b.id);
      // The app never draws a block with nothing in it, so a card with no items would silently not appear.
      if (b.enabled !== false && b.data?.mode === 'inline' && !(b.data.items || []).length) {
        out.push(`${where}“${b.title || reg?.typeMap?.[b.type]?.title || b.type}” has nothing in it yet, so the phone will not show it.`);
      }
    }
    if (!isDefault(l) && l.enabled !== false && !(l.audience || []).length && !l.startsAt && !l.endsAt) {
      out.push(`“${l.name}” has no schedule and no audience, so it is shown to everyone instead of the default layout.`);
    }
  }
  return out;
}

/* ----------------------------------------------------------------- IST -- */
const IST = 330 * 60000;
/** ISO instant -> "YYYY-MM-DDTHH:mm" in IST for a datetime-local input; '' when blank. */
export function toInput(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? '' : new Date(t + IST).toISOString().slice(0, 16);
}
/** A datetime-local value, read as IST -> ISO instant; null when blank. */
export function fromInput(v) {
  if (!v) return null;
  const t = new Date(`${v}:00+05:30`).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
