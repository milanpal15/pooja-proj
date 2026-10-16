/**
 * Pure helpers over the Home-layout registry (docs/HOME_LAYOUT.md §2-§4).
 * The builder has NO per-block-type code: every form, default and palette
 * entry is read from `GET /api/admin/home-layout/registry` through here.
 *
 * Schemas (`props`, a source's `params`) are accepted as JSON-schema-ish
 * ({ type:'object', properties }), as a bare map of key -> spec, or as a list.
 */

export const humanise = (k) => {
  const s = String(k || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const asKey = (x, ...names) => (typeof x === 'string' ? x : names.map((n) => x?.[n]).find((v) => v != null) ?? '');

/** The raw registry -> { types, typeMap, sources, sourceMap, actions, icons, tones, flags }. Never throws. */
export function normaliseRegistry(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const types = (Array.isArray(r.blockTypes) ? r.blockTypes : []).filter((t) => t && t.type).map((t) => ({
    type: t.type,
    title: t.title || humanise(t.type),
    description: t.description || '',
    minAppVersion: t.minAppVersion || '',
    icon: t.icon || '',
    group: t.group || t.category || '',
    props: t.props || null,
    data: {
      modes: Array.isArray(t.data?.modes) ? t.data.modes.filter((m) => m === 'inline' || m === 'source') : [],
      sources: Array.isArray(t.data?.sources) ? t.data.sources : null,
      defaultMode: t.data?.defaultMode || t.data?.default || '',
      itemFields: Array.isArray(t.data?.itemFields) ? t.data.itemFields : null,
      maxItems: t.data?.maxItems || 0,
    },
  }));
  const sources = (Array.isArray(r.sources) ? r.sources : []).map((s) => ({
    key: asKey(s, 'key', 'id'),
    title: typeof s === 'string' ? humanise(s) : s.title || humanise(s.key),
    params: typeof s === 'string' ? null : s.params || null,
    auth: !!s?.auth,
    description: s?.description || '',
  })).filter((s) => s.key);
  return {
    types,
    typeMap: Object.fromEntries(types.map((t) => [t.type, t])),
    sources,
    sourceMap: Object.fromEntries(sources.map((s) => [s.key, s])),
    actions: (Array.isArray(r.actionTypes) ? r.actionTypes : []).map((a) => asKey(a, 'type', 'key', 'value')).filter(Boolean),
    icons: (Array.isArray(r.icons) ? r.icons : []).map((a) => asKey(a, 'name', 'key', 'value')).filter(Boolean),
    tones: (Array.isArray(r.tones) ? r.tones : []).map((a) => asKey(a, 'name', 'key', 'value')).filter(Boolean),
    limits: { blocks: 60, items: 24, text: 160, ...(r.limits && typeof r.limits === 'object' ? r.limits : {}) },
    flags: (Array.isArray(r.flags) ? r.flags : []).map((a) => asKey(a, 'key', 'name', 'value')).filter(Boolean),
  };
}

export const EMPTY_REGISTRY = normaliseRegistry(null);

/** How many inline cards a block of this type may hold: the type's own cap, else the registry's. */
export const maxItemsOf = (type, reg) => Math.min(type?.data?.maxItems || reg.limits.items, reg.limits.items);

/** Modes a type allows, in registry order ([] = the type has no data). */
export const modesOf = (type) => type?.data?.modes || [];

/** Sources a type may bind to (null/missing list = any the registry lists). */
export function sourcesOf(type, reg) {
  const allowed = type?.data?.sources;
  return allowed ? allowed.map((k) => reg.sourceMap[k] || { key: k, title: humanise(k), params: null, auth: false }) : reg.sources;
}

/** The mode a new block of this type starts in. */
export function defaultMode(type) {
  const m = modesOf(type);
  return (type?.data?.defaultMode && m.includes(type.data.defaultMode) ? type.data.defaultMode : m[0]) || '';
}

/* ---------------------------------------------------------- schema fields -- */
/** A param named like a catalogue gets a picker from it (the registry may also say `ref`). */
const KEY_REFS = { temple: 'temples', category: 'categories' };
const SKIP = ['type', 'required', 'additionalProperties', '$schema', 'title', 'description'];

function field(key, spec, required) {
  const s = typeof spec === 'string' ? { type: spec } : spec || {};
  const t = String(s.type || '').toLowerCase();
  const options = (s.options || s.enum || []).map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label ?? String(o.value) } : { value: String(o), label: String(o) }));
  const html = t === 'html' || s.format === 'html' || s.format === 'textarea' || /^html/i.test(key) || (s.maxLength || 0) > 300;
  let type = 'text';
  if (t === 'number' || t === 'integer') type = 'number';
  else if (t === 'boolean' || t === 'bool') type = 'boolean';
  else if (t === 'array') type = 'list';
  if (options.length) type = 'select';
  else if (type === 'text' && html) type = 'textarea';
  return {
    key,
    type,
    options,
    integer: t === 'integer',
    label: s.label || s.title || humanise(key),
    numeric: t === 'number' || t === 'integer',
    hint: s.hint || s.description || (t === 'html' || s.format === 'html' ? 'Sanitised when saved.' : ''),
    placeholder: s.placeholder || '',
    required: s.required === true || required === true,
    min: s.min ?? s.minimum,
    max: s.max ?? s.maximum,
    maxLength: s.maxLength,
    ref: s.ref ?? s['x-ref'] ?? s.lookup ?? KEY_REFS[key] ?? '',
    def: s.default ?? s.def,
  };
}

/** A `props` / `params` schema -> ordered field specs. Unknown notation -> []. */
export function schemaFields(schema) {
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema)) return schema.filter((f) => f && (f.key || f.name)).map((f) => field(f.key || f.name, f, f.required));
  if (schema.properties && typeof schema.properties === 'object') {
    const req = Array.isArray(schema.required) ? schema.required : [];
    return Object.entries(schema.properties).map(([k, v]) => field(k, v, req.includes(k)));
  }
  return Object.entries(schema).filter(([k, v]) => !SKIP.includes(k) && v && typeof v === 'object').map(([k, v]) => field(k, v, v.required));
}

/** Starting values from a schema: each default, else a blank of the field's kind. */
export function schemaDefaults(schema) {
  const out = {};
  for (const f of schemaFields(schema)) {
    if (f.def !== undefined) out[f.key] = f.def;
    else if (f.type === 'boolean') out[f.key] = false;
    else if (f.type === 'list') out[f.key] = [];
    else if (f.type === 'number') continue;
    else if (f.type === 'select') out[f.key] = f.options[0]?.value ?? '';
    else out[f.key] = '';
  }
  return out;
}

/** The values to send: numbers coerced (also enum numbers), blanks dropped, lists trimmed. Unknown keys are kept out. */
export function schemaBody(schema, values = {}) {
  const out = {};
  for (const f of schemaFields(schema)) {
    const v = values[f.key];
    if (f.type === 'boolean') out[f.key] = !!v;
    else if (f.type === 'list') {
      const list = (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);
      if (list.length || f.required) out[f.key] = list;
    } else if (v === '' || v == null) continue; // blank = unset (the server applies the default)
    else if (f.numeric) out[f.key] = Number(v);
    else out[f.key] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/** Field -> message from the schema's own limits (the server stays the authority). */
export function schemaProblems(schema, values = {}) {
  const e = {};
  for (const f of schemaFields(schema)) {
    const v = values[f.key];
    const blank = v === '' || v == null || (Array.isArray(v) && !v.length);
    if (f.type === 'boolean') continue;
    if (blank) {
      if (f.required) e[f.key] = `${f.label} is required`;
      continue;
    }
    if (f.numeric && f.type !== 'select') {
      const n = Number(v);
      if (!Number.isFinite(n)) e[f.key] = 'Enter a number';
      else if (f.integer && !Number.isInteger(n)) e[f.key] = 'Enter a whole number';
      else if (f.min != null && n < f.min) e[f.key] = `At least ${f.min}`;
      else if (f.max != null && n > f.max) e[f.key] = `At most ${f.max}`;
    } else if (f.maxLength && typeof v === 'string' && v.length > f.maxLength) e[f.key] = `At most ${f.maxLength} characters`;
  }
  return e;
}

/* ---------------------------------------------------------------- palette -- */
const GROUPS = { inline: 'Cards and content', source: 'Live feeds', none: 'Page chrome and layout' };

/** Types grouped for the "Add block" palette: the registry's own `group`, else by how the type holds data. */
export function groupTypes(types) {
  const out = [];
  for (const t of types) {
    const label = t.group || (t.data.modes.includes('inline') ? GROUPS.inline : t.data.modes.length ? GROUPS.source : GROUPS.none);
    let g = out.find((x) => x.label === label);
    if (!g) out.push((g = { label, types: [] }));
    g.types.push(t);
  }
  return out;
}
