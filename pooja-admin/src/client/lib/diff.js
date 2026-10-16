/**
 * before -> after as a flat list of field changes (Approvals and the Audit log both show it).
 * Objects are walked to dotted paths; arrays of plain values are one field (compared as a whole);
 * arrays containing objects are walked by index.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPlainList = (v) => Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function flatten(v, prefix, out) {
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (!keys.length && prefix) out[prefix] = v;
    for (const k of keys) flatten(v[k], prefix ? `${prefix}.${k}` : k, out);
  } else if (Array.isArray(v) && !isPlainList(v)) {
    v.forEach((x, i) => flatten(x, `${prefix}.${i}`, out));
    if (!v.length && prefix) out[prefix] = v;
  } else if (prefix) out[prefix] = v;
  return out;
}

/** @returns {{ path, kind:'added'|'removed'|'changed'|'same', before, after }[]} in the order fields first appear. */
export function buildDiff(before, after) {
  const a = flatten(before ?? {}, '', {});
  const b = flatten(after ?? {}, '', {});
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return paths.map((path) => {
    const inA = path in a;
    const inB = path in b;
    let kind = 'changed';
    if (inA && !inB) kind = 'removed';
    else if (!inA && inB) kind = 'added';
    else if (same(a[path], b[path])) kind = 'same';
    // A field set to null/empty from absent is not a visible change.
    if (kind === 'added' && (b[path] === null || b[path] === '')) kind = 'same';
    if (kind === 'removed' && (a[path] === null || a[path] === '')) kind = 'same';
    return { path, kind, before: a[path], after: b[path] };
  });
}

export const changedOnly = (rows) => rows.filter((r) => r.kind !== 'same');

/** A value as one readable line: '—' for nothing, a comma list for arrays, ISO dates left to the caller's `format`. */
export function showValue(v, format) {
  if (v === undefined || v === null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map((x) => showValue(x, format)).join(', ') : 'none';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (isObj(v)) return JSON.stringify(v);
  return format ? format(v) : String(v);
}
