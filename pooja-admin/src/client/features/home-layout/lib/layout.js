/**
 * Pure rules for the Home layout document (docs/HOME_LAYOUT.md §1): ids,
 * blank blocks and items, reorder / duplicate / remove, the cleaned body that
 * is sent, and the warnings about a draft. No React, no fetching. Nothing here
 * branches on a block type's name: a type is whatever the registry says.
 */
import { defaultMode, modesOf, schemaBody, schemaDefaults, sourcesOf } from './registry.js';

export const SCHEMA_VERSION = 1;
export const MAX_BLOCKS = 60;
export const MAX_ITEMS = 24;
export const BADGES = ['', 'new', 'soon', 'special'];
export const LANGUAGES = [
  { value: 'all', label: 'Everyone' },
  { value: 'en', label: 'English only' },
  { value: 'hi', label: 'Hindi only' },
];
/** The one block whose removal strands the devotee (docs/HOME_LAYOUT.md §6): warn when the draft has none. */
export const NAV_CRITICAL = ['header'];

export const COMMON_KEYS = ['id', 'type', 'enabled', 'startsAt', 'endsAt', 'language', 'flag', 'title', 'titleHi', 'subtitle', 'subtitleHi', 'tone', 'action', 'actionLabel', 'actionLabelHi', 'props', 'data'];
export const ITEM_KEYS = ['title', 'titleHi', 'subtitle', 'subtitleHi', 'icon', 'image', 'badge', 'liveBadge', 'flag', 'deitySlug', 'action'];

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

/* ----------------------------------------------------------------- blanks -- */
export const blankItem = () => ({ title: '', titleHi: '', subtitle: '', subtitleHi: '', icon: '', image: '', badge: '', liveBadge: false, flag: '', deitySlug: '', action: null });

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

/* ------------------------------------------------------------ list edits -- */
const idx = (blocks, id) => blocks.findIndex((b) => b.id === id);

export function moveBlock(blocks, id, delta) {
  const i = idx(blocks, id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const next = blocks.slice();
  next.splice(j, 0, next.splice(i, 1)[0]);
  return next;
}

export function insertBlock(blocks, block, afterId) {
  const i = idx(blocks, afterId);
  const at = i < 0 ? blocks.length : i + 1;
  return [...blocks.slice(0, at), block, ...blocks.slice(at)];
}

/** A deep copy of a block placed right after it, with a fresh id. */
export function duplicateBlock(blocks, id, taken, rng) {
  const i = idx(blocks, id);
  if (i < 0) return { blocks, id: null };
  const copy = { ...JSON.parse(JSON.stringify(blocks[i])), id: newId([...idsOf(blocks), ...taken], rng) };
  return { blocks: [...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)], id: copy.id };
}

export const removeBlock = (blocks, id) => blocks.filter((b) => b.id !== id);
export const patchBlock = (blocks, id, patch) => blocks.map((b) => (b.id === id ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b));

/** Where selection goes after `id` is removed: the block now in its place, else the one before. */
export function selectionAfterRemove(blocks, id) {
  const i = idx(blocks, id);
  const rest = removeBlock(blocks, id);
  return rest[Math.min(i, rest.length - 1)]?.id ?? null;
}

/* ------------------------------------------------------------ sending -- */
const text = (v) => (v == null ? '' : String(v));
const isoOrNull = (v) => (v ? String(v) : null);

function cleanAction(a) {
  if (!a || typeof a !== 'object' || !a.type) return null;
  return { type: a.type, ref: text(a.ref).trim() };
}

function cleanItem(it) {
  const i = it && typeof it === 'object' ? it : {};
  return {
    title: text(i.title), titleHi: text(i.titleHi), subtitle: text(i.subtitle), subtitleHi: text(i.subtitleHi),
    icon: text(i.icon), image: text(i.image), badge: BADGES.includes(i.badge) ? i.badge : '', liveBadge: !!i.liveBadge,
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
    id: text(b.id), type: text(b.type), enabled: b.enabled !== false,
    startsAt: isoOrNull(b.startsAt), endsAt: isoOrNull(b.endsAt),
    language: ['en', 'hi'].includes(b.language) ? b.language : 'all', flag: text(b.flag),
    title: text(b.title), titleHi: text(b.titleHi), subtitle: text(b.subtitle), subtitleHi: text(b.subtitleHi),
    tone: text(b.tone), action: cleanAction(b.action), actionLabel: text(b.actionLabel), actionLabelHi: text(b.actionLabelHi),
    props: type?.props ? schemaBody(type.props, b.props || {}) : b.props && typeof b.props === 'object' ? b.props : {},
    data: cleanData(b.data, type, reg),
  };
}

export const toBody = (doc, reg) => ({ schemaVersion: doc?.schemaVersion || SCHEMA_VERSION, blocks: (doc?.blocks || []).map((b) => cleanBlock(b, reg)) });

/** A stable string for "has this changed?" (key order of a cleaned body is fixed). */
export const fingerprint = (doc, reg) => JSON.stringify(toBody(doc, reg));

/* --------------------------------------------------------------- warnings -- */
/** Plain-language warnings about a draft that is valid but probably not intended. */
export function warnings(doc) {
  const blocks = doc?.blocks || [];
  const out = [];
  for (const t of NAV_CRITICAL) {
    if (!blocks.some((b) => b.type === t && b.enabled !== false)) out.push(`The draft has no switched-on “${t}” block. The Home screen would lose its greeting, wallet chip and reminders bell.`);
  }
  if (blocks.length === 0) out.push('The draft has no blocks; the phone would show an empty Home.');
  if (blocks.length > MAX_BLOCKS) out.push(`The draft has ${blocks.length} blocks; at most ${MAX_BLOCKS} are accepted.`);
  const seen = new Set();
  for (const b of blocks) {
    if (seen.has(b.id)) out.push(`Two blocks share the id “${b.id}”.`);
    seen.add(b.id);
    // The app never draws a block with nothing in it, so a card with no items would silently not appear.
    if (b.enabled !== false && b.data?.mode === 'inline' && !(b.data.items || []).length) {
      out.push(`“${b.title || b.type}” has no cards yet, so the phone will not show it. Add at least one card, or switch it to a live source.`);
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
