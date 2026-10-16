/**
 * The JSON tab's pure side: parse what was typed or imported into a document,
 * fill what the file left out, and report what was changed or dropped.
 * Lenient on the way in, strict on the way out (`toBody` in layout.js).
 */
import { COMMON_KEYS, ITEM_KEYS, MAX_BLOCKS, SCHEMA_VERSION, newId } from './layout.js';

export const format = (doc) => JSON.stringify(doc, null, 2);

const DEFAULTS = {
  enabled: true, startsAt: null, endsAt: null, language: 'all', flag: '', title: '', titleHi: '', subtitle: '', subtitleHi: '',
  tone: '', action: null, actionLabel: '', actionLabelHi: '', props: {}, data: null,
};

/** Where an exported / wrapped document keeps its blocks. */
function unwrap(v) {
  if (Array.isArray(v)) return { schemaVersion: SCHEMA_VERSION, blocks: v };
  if (v && typeof v === 'object') {
    if (Array.isArray(v.blocks)) return v;
    for (const k of ['document', 'draft', 'layout']) if (v[k] && Array.isArray(v[k].blocks)) return v[k];
  }
  return null;
}

/**
 * Text -> { doc, notes, error }.
 *  - accepts { schemaVersion, blocks }, a bare array of blocks, or a wrapper ({ draft | document | layout });
 *  - fills missing common fields, generates ids for blocks without one and for repeats;
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
  if (!src) return { doc: null, notes: [], error: 'Expected an object like { "schemaVersion": 1, "blocks": [ … ] }.' };
  const notes = [];
  if (src.schemaVersion != null && src.schemaVersion !== SCHEMA_VERSION) notes.push(`schemaVersion ${src.schemaVersion} is not ${SCHEMA_VERSION}; the server will decide whether it accepts it.`);
  const seen = new Set();
  const dropped = new Set();
  const blocks = [];
  src.blocks.forEach((b, i) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      notes.push(`Block ${i + 1} is not an object and was skipped.`);
      return;
    }
    const out = { ...DEFAULTS };
    for (const [k, v] of Object.entries(b)) {
      if (COMMON_KEYS.includes(k)) out[k] = v;
      else dropped.add(k);
    }
    if (!out.type) {
      notes.push(`Block ${i + 1} has no type and was skipped.`);
      return;
    }
    if (out.props == null || typeof out.props !== 'object' || Array.isArray(out.props)) out.props = {};
    if (out.data && Array.isArray(out.data.items)) {
      out.data = { ...out.data, items: out.data.items.map((it) => {
        const item = {};
        for (const [k, v] of Object.entries(it && typeof it === 'object' ? it : {})) if (ITEM_KEYS.includes(k)) item[k] = v;
        return item;
      }) };
    }
    if (!out.id || seen.has(out.id)) {
      if (out.id) notes.push(`Block ${i + 1} repeated the id “${out.id}”; it was given a new one.`);
      out.id = newId([...seen, ...src.blocks.map((x) => x?.id).filter(Boolean)], rng);
    }
    seen.add(out.id);
    blocks.push(out);
  });
  if (dropped.size) notes.push(`Dropped fields the layout does not have: ${[...dropped].join(', ')}.`);
  if (blocks.length > MAX_BLOCKS) notes.push(`${blocks.length} blocks is over the limit of ${MAX_BLOCKS}.`);
  return { doc: { schemaVersion: SCHEMA_VERSION, blocks }, notes, error: '' };
}

/** A quick read of the text for the status line: "16 blocks", or the parse error. */
export function peek(textValue) {
  try {
    const d = unwrap(JSON.parse(textValue));
    return d ? { ok: true, blocks: d.blocks.length } : { ok: false, error: 'Expected { "schemaVersion": 1, "blocks": [ … ] }' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** A file name for Export: home-layout-draft-2026-10-15.json */
export const exportName = (label, now = new Date()) => `home-layout-${label}-${now.toISOString().slice(0, 10)}.json`;
