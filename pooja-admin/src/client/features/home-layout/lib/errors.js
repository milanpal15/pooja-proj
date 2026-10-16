/**
 * The API's 400 `bad_layout` `fields` ({ 'layouts.1.blocks.3.audience.0': 'message' })
 * mapped onto the exact layout, block and field. Errors are keyed by layout and
 * block ID at the moment they arrive, so reordering afterwards cannot point them
 * at the wrong block, and each one remembers the value it was about: it stays
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
 * @returns {{ entries: Array<{path, layoutId, blockId, sub, message, snapshot}>, global: Array<{path, message}> }}
 * `blockId` is null for an error on the layout itself ('layouts.2.name'); `sub` is the path inside the block
 * (or layout) ('data.source', 'audience.0', '' for the block itself). `global` holds what belongs to no layout
 * ('schemaVersion', 'layouts', a gone index).
 */
export function mapErrors(fields, doc) {
  const entries = [];
  const global = [];
  const layouts = doc?.layouts || [];
  for (const [path, message] of Object.entries(normaliseFields(fields))) {
    const m = /^layouts\.(\d+)(?:\.(.*))?$/.exec(path);
    const layout = m ? layouts[Number(m[1])] : null;
    if (!layout) {
      global.push({ path, message });
      continue;
    }
    const rest = m[2] || '';
    const b = /^blocks\.(\d+)(?:\.(.*))?$/.exec(rest);
    if (b) {
      const block = layout.blocks?.[Number(b[1])];
      if (!block) {
        entries.push({ path, layoutId: layout.id, blockId: null, sub: rest, message, snapshot: null });
        continue;
      }
      const sub = b[2] || '';
      entries.push({ path, layoutId: layout.id, blockId: block.id, sub, message, snapshot: sub ? JSON.stringify(getPath(block, sub) ?? null) : null });
    } else {
      // 'blocks' (a count rule) has no single value to watch; keep it until the next save.
      entries.push({ path, layoutId: layout.id, blockId: null, sub: rest, message, snapshot: rest && rest !== 'blocks' ? JSON.stringify(getPath(layout, rest) ?? null) : null });
    }
  }
  return { entries, global };
}

/** The entries still true for the current document (field unedited, layout / block still there). */
export function activeEntries(entries, doc) {
  return entries.filter((e) => {
    const l = (doc?.layouts || []).find((x) => x.id === e.layoutId);
    if (!l) return false;
    if (e.blockId) {
      const b = (l.blocks || []).find((x) => x.id === e.blockId);
      if (!b) return false;
      return e.snapshot === null || JSON.stringify(getPath(b, e.sub) ?? null) === e.snapshot;
    }
    return e.snapshot === null || JSON.stringify(getPath(l, e.sub) ?? null) === e.snapshot;
  });
}

/** { blocks: { 'layoutId/blockId': { sub: message } }, layouts: { layoutId: { sub: message } } } */
export function indexErrors(entries) {
  const out = { blocks: {}, layouts: {} };
  for (const e of entries) {
    if (e.blockId) (out.blocks[blockKey(e.layoutId, e.blockId)] ||= {})[e.sub] = e.message;
    else (out.layouts[e.layoutId] ||= {})[e.sub] = e.message;
  }
  return out;
}
export const blockKey = (layoutId, blockId) => `${layoutId}/${blockId}`;

/** How many errors sit at or under `sub` ('data.items.2') for one block's map. */
export const countUnder = (errs = {}, sub) => Object.keys(errs).filter((k) => k === sub || k.startsWith(`${sub}.`)).length;

/** "Navratri layout › Section 4 (Services grid) › data › source" for a banner line. */
export function describeEntry(e, doc, reg) {
  const l = (doc?.layouts || []).find((x) => x.id === e.layoutId);
  const lead = (doc?.layouts || []).length > 1 && l ? `${l.name} › ` : '';
  const tail = e.sub ? ` › ${e.sub.replace(/\./g, ' › ')}` : '';
  if (!e.blockId) return `${lead || (l ? `${l.name} › ` : '')}Layout settings${tail}`;
  const i = (l?.blocks || []).findIndex((b) => b.id === e.blockId);
  const b = l?.blocks?.[i];
  const raw = b ? b.title || reg?.typeMap?.[b.type]?.title || b.type : e.blockId;
  const label = raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
  return `${lead}Section ${i + 1} (${label})${tail}`;
}
