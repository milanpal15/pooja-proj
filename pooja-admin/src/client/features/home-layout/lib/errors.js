/**
 * The API's 400 `bad_layout` `fields` ({ 'blocks.3.data.source': 'message' })
 * mapped onto the exact block and field. Errors are keyed by block ID at the
 * moment they arrive, so reordering the list afterwards cannot point them at
 * the wrong block, and each one remembers the value it was about: it stays
 * while that value is unchanged and clears the moment the field is edited.
 */

const norm = (p) => String(p ?? '').replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');

/** Accepts an object map or a list of { path|field, message|error }. -> { path: message } */
export function normaliseFields(fields) {
  const out = {};
  const put = (path, msg) => {
    const k = norm(path);
    if (k && msg) out[k] = typeof msg === 'string' ? msg : msg.message || msg.error || String(msg);
  };
  if (Array.isArray(fields)) fields.forEach((f) => put(f?.path ?? f?.field ?? f?.key, f?.message ?? f?.error ?? f?.msg));
  else if (fields && typeof fields === 'object') Object.entries(fields).forEach(([k, v]) => put(k, v));
  return out;
}

export function getPath(obj, path) {
  return String(path).split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * @returns {{ entries: Array<{path, blockId, sub, message, snapshot}>, global: Array<{path, message}> }}
 * `sub` is the path inside the block ('data.source', '' for the block itself).
 * `global` holds what belongs to no block ('schemaVersion', 'blocks', a gone index).
 */
export function mapErrors(fields, blocks) {
  const entries = [];
  const global = [];
  for (const [path, message] of Object.entries(normaliseFields(fields))) {
    const m = /^blocks\.(\d+)(?:\.(.*))?$/.exec(path);
    const block = m ? blocks[Number(m[1])] : null;
    if (!block) {
      global.push({ path, message });
      continue;
    }
    const sub = m[2] || '';
    entries.push({ path, blockId: block.id, sub, message, snapshot: sub ? JSON.stringify(getPath(block, sub) ?? null) : null });
  }
  return { entries, global };
}

/** The entries still true for the current blocks (field unedited, block still there). */
export function activeEntries(entries, blocks) {
  return entries.filter((e) => {
    const b = blocks.find((x) => x.id === e.blockId);
    if (!b) return false;
    return e.snapshot === null || JSON.stringify(getPath(b, e.sub) ?? null) === e.snapshot;
  });
}

/** { blockId: { sub: message } } */
export function bySubpath(entries) {
  const out = {};
  for (const e of entries) (out[e.blockId] ||= {})[e.sub] = e.message;
  return out;
}

/** How many errors sit at or under `sub` ('data.items.2') for one block's map. */
export const countUnder = (errs = {}, sub) => Object.keys(errs).filter((k) => k === sub || k.startsWith(`${sub}.`)).length;

/** "Block 4 · shelf › data › source" for a banner line. */
export function describeEntry(e, blocks) {
  const i = blocks.findIndex((b) => b.id === e.blockId);
  const b = blocks[i];
  const raw = b ? (b.title || b.type) : e.blockId;
  const label = raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
  return `Block ${i + 1} (${label})${e.sub ? ` › ${e.sub.replace(/\./g, ' › ')}` : ''}`;
}
