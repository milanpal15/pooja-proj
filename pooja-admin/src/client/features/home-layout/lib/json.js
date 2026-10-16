/**
 * The JSON tab's pure side: parse what was typed or imported into a layout SET
 * (docs/HOME_LAYOUT.md §9.1), fill what the file left out, and report what was
 * changed or dropped. A v1 paste (`{ blocks }` or a bare array of blocks) is
 * wrapped as the default layout. Lenient on the way in, strict on the way out
 * (`toBody` in layout.js).
 */
import { COMMON_KEYS, DEFAULT_ID, ITEM_KEYS, LAYOUT_KEYS, MAX_BLOCKS, MAX_LAYOUTS, SCHEMA_VERSION, layoutIdFor, newId } from './layout.js';

export const format = (doc) => JSON.stringify(doc, null, 2);

const BLOCK_DEFAULTS = {
  enabled: true, audience: [], startsAt: null, endsAt: null, language: 'all', flag: '', title: '', titleHi: '', subtitle: '', subtitleHi: '',
  tone: '', action: null, actionLabel: '', actionLabelHi: '', props: {}, data: null,
};

/** Where an exported / wrapped document keeps its layouts: -> { layouts } | { blocks } | null. */
function unwrap(v, depth = 0) {
  if (Array.isArray(v)) return { blocks: v, wrapped: true };
  if (v && typeof v === 'object') {
    if (Array.isArray(v.layouts)) return v;
    if (Array.isArray(v.blocks)) return { ...v, wrapped: true };
    if (depth < 2) for (const k of ['document', 'draft', 'layout']) if (v[k]) { const r = unwrap(v[k], depth + 1); if (r) return r; }
  }
  return null;
}

/** A block read leniently: unknown keys dropped (collected in `dropped`), defaults filled, a fresh id when missing or repeated. */
function readBlock(b, i, ctx) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    ctx.notes.push(`${ctx.where}section ${i + 1} is not an object and was skipped.`);
    return null;
  }
  const out = { ...BLOCK_DEFAULTS };
  for (const [k, v] of Object.entries(b)) {
    if (COMMON_KEYS.includes(k)) out[k] = v;
    else ctx.dropped.add(k);
  }
  if (!out.type) {
    ctx.notes.push(`${ctx.where}section ${i + 1} has no type and was skipped.`);
    return null;
  }
  if (out.props == null || typeof out.props !== 'object' || Array.isArray(out.props)) out.props = {};
  if (!Array.isArray(out.audience)) out.audience = [];
  if (out.data && Array.isArray(out.data.items)) {
    out.data = { ...out.data, items: out.data.items.map((it) => {
      const item = {};
      for (const [k, v] of Object.entries(it && typeof it === 'object' ? it : {})) if (ITEM_KEYS.includes(k)) item[k] = v;
      return item;
    }) };
  }
  if (!out.id || ctx.seen.has(out.id)) {
    if (out.id) ctx.notes.push(`${ctx.where}section ${i + 1} repeated the id “${out.id}”; it was given a new one.`);
    out.id = newId([...ctx.seen, ...ctx.all], ctx.rng);
  }
  ctx.seen.add(out.id);
  return out;
}

function readLayout(l, i, taken, rng, notes, dropped) {
  const where = `Layout ${i + 1}: `;
  if (!l || typeof l !== 'object' || Array.isArray(l)) {
    notes.push(`Layout ${i + 1} is not an object and was skipped.`);
    return null;
  }
  const out = { id: '', name: '', enabled: true, audience: [], startsAt: null, endsAt: null, blocks: [] };
  for (const [k, v] of Object.entries(l)) {
    if (LAYOUT_KEYS.includes(k)) out[k] = v;
    else dropped.add(k);
  }
  if (!Array.isArray(out.audience)) out.audience = [];
  if (!out.name) out.name = out.id === DEFAULT_ID ? 'Default layout' : `Layout ${i + 1}`;
  if (!out.id || taken.has(out.id)) {
    if (out.id) notes.push(`${where}the id “${out.id}” was repeated; it was given a new one.`);
    out.id = layoutIdFor(out.name, [...taken]);
  }
  taken.add(out.id);
  const ctx = { notes, dropped, seen: new Set(), all: (Array.isArray(l.blocks) ? l.blocks : []).map((x) => x?.id).filter(Boolean), rng, where };
  out.blocks = (Array.isArray(l.blocks) ? l.blocks : []).map((b, bi) => readBlock(b, bi, ctx)).filter(Boolean);
  if (out.blocks.length > MAX_BLOCKS) notes.push(`${where}${out.blocks.length} sections is over the limit of ${MAX_BLOCKS}.`);
  return out;
}

/**
 * Text -> { doc, notes, error }.
 *  - accepts a v2 `{ schemaVersion, layouts }`, a v1 `{ blocks }` or a bare array of blocks (both wrapped as the default layout),
 *    or a wrapper ({ draft | document | layout });
 *  - fills missing fields, generates ids for blocks without one and for repeats;
 *  - drops fields the contract does not have (the server rejects them) and says so.
 * `error` is a sentence and `doc` is null when the text cannot be used at all.
 */
export function parseDocument(textValue, rng) {
  let raw;
  try {
    raw = JSON.parse(textValue);
  } catch (e) {
    return { doc: null, notes: [], error: `Not valid JSON: ${e.message}` };
  }
  const src = unwrap(raw);
  if (!src) return { doc: null, notes: [], error: 'Expected an object like { "schemaVersion": 2, "layouts": [ … ] }.' };
  const notes = [];
  const dropped = new Set();
  let layoutsRaw = src.layouts;
  if (!layoutsRaw) {
    notes.push('This is a single-layout (older) document; it was wrapped as the default layout.');
    layoutsRaw = [{ id: DEFAULT_ID, name: 'Default layout', blocks: src.blocks }];
  } else if (src.schemaVersion != null && src.schemaVersion !== SCHEMA_VERSION) {
    notes.push(`schemaVersion ${src.schemaVersion} is not ${SCHEMA_VERSION}; the server will decide whether it accepts it.`);
  }
  const taken = new Set();
  const layouts = layoutsRaw.map((l, i) => readLayout(l, i, taken, rng, notes, dropped)).filter(Boolean);
  if (dropped.size) notes.push(`Dropped fields the layout does not have: ${[...dropped].join(', ')}.`);
  if (layouts.length > MAX_LAYOUTS) notes.push(`${layouts.length} layouts is over the limit of ${MAX_LAYOUTS}.`);
  return { doc: { schemaVersion: SCHEMA_VERSION, layouts }, notes, error: '' };
}

/** A quick read of the text for the status line: "3 layouts, 40 sections", or the parse error. */
export function peek(textValue) {
  try {
    const d = unwrap(JSON.parse(textValue));
    if (!d) return { ok: false, error: 'Expected { "schemaVersion": 2, "layouts": [ … ] }' };
    const layouts = d.layouts ? d.layouts.length : 1;
    const blocks = d.layouts ? d.layouts.reduce((n, l) => n + (Array.isArray(l?.blocks) ? l.blocks.length : 0), 0) : d.blocks.length;
    return { ok: true, layouts, blocks };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** A file name for Export: home-layout-draft-2026-10-15.json */
export const exportName = (label, now = new Date()) => `home-layout-${label}-${now.toISOString().slice(0, 10)}.json`;
