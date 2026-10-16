/**
 * Pure helpers that turn the task-kind registry (docs/EVENTS.md §4) into form
 * fields. The dashboard has NO per-kind code: whatever `configSchema` a kind
 * declares is rendered by `ConfigFields`, validated here, and sent back as
 * `config`. Adding a kind on the server therefore needs no dashboard change.
 *
 * `configSchema` is accepted in three shapes, because the contract names the
 * field but not the notation:
 *   - JSON Schema:  { type:'object', properties:{ k:{ type, title, enum, minimum… } }, required:[…] }
 *   - a map:        { k:{ type, label, required, options, ref, min, max, default, hint } }
 *   - a list:       [ { key|name, type, label… } ]
 * A string field can point at a catalogue with `ref` (or `x-ref` / `lookup`):
 * streams, listings, poojas, temples, aartis, badges. Without one, a key that
 * ends in `StreamSlug`-style (streamSlug, aartiSlug…) is matched by name.
 */

export const REFS = ['streams', 'listings', 'poojas', 'temples', 'aartis', 'badges'];

const REF_WORDS = [
  [/stream/i, 'streams'],
  [/listing/i, 'listings'],
  [/pooja/i, 'poojas'],
  [/temple/i, 'temples'],
  [/aarti/i, 'aartis'],
  [/badge/i, 'badges'],
];

/** "streamSlug" -> "Stream slug". */
export const humanise = (k) => {
  const s = String(k || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function refOf(key, spec) {
  const raw = spec.ref ?? spec['x-ref'] ?? spec.lookup;
  if (raw) {
    const hit = REF_WORDS.find(([re]) => re.test(String(raw)));
    return hit ? hit[1] : null;
  }
  if (!/slug$/i.test(key)) return null;
  const hit = REF_WORDS.find(([re]) => re.test(key));
  return hit ? hit[1] : null;
}

function normaliseField(key, spec = {}, required) {
  const s = typeof spec === 'string' ? { type: spec } : spec || {};
  const t = String(s.type || '').toLowerCase();
  const options = (s.options || s.enum || []).map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label ?? String(o.value) } : { value: String(o), label: String(o) }));
  const ref = refOf(key, s);
  let type = 'text';
  if (t === 'number' || t === 'integer') type = 'number';
  else if (t === 'boolean' || t === 'bool' || t === 'checkbox') type = 'boolean';
  if (options.length) type = 'select';
  if (ref) type = 'ref';
  return {
    key,
    type,
    ref,
    options,
    integer: t === 'integer',
    label: s.label || s.title || humanise(key),
    hint: s.hint || s.description || '',
    placeholder: s.placeholder || '',
    required: s.required === true || required === true,
    min: s.min ?? s.minimum,
    max: s.max ?? s.maximum,
    def: s.default ?? s.def,
  };
}

/** A kind's `configSchema` -> ordered field specs. Unknown notation -> no fields (never throws). */
export function fieldsOf(schema) {
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema)) {
    return schema.filter((f) => f && (f.key || f.name)).map((f) => normaliseField(f.key || f.name, f, f.required));
  }
  if (schema.properties && typeof schema.properties === 'object') {
    const req = Array.isArray(schema.required) ? schema.required : [];
    return Object.entries(schema.properties).map(([k, v]) => normaliseField(k, v, req.includes(k)));
  }
  if (schema.type === 'object' || schema.type === undefined) {
    // A bare map of key -> spec; skip JSON-Schema envelope words.
    return Object.entries(schema)
      .filter(([k, v]) => !['type', 'required', 'additionalProperties', '$schema', 'title', 'description'].includes(k) && v && typeof v === 'object')
      .map(([k, v]) => normaliseField(k, v, v.required));
  }
  return [];
}

/** Starting `config` for a new task of a kind: each field's default, else blank. */
export function configDefaults(schema) {
  const out = {};
  for (const f of fieldsOf(schema)) {
    if (f.def !== undefined) out[f.key] = f.def;
    else out[f.key] = f.type === 'boolean' ? false : '';
  }
  return out;
}

/** The `config` to send: numbers coerced, blanks dropped (a blank required one fails validation first). */
export function configBody(schema, config = {}) {
  const out = {};
  for (const f of fieldsOf(schema)) {
    const v = config[f.key];
    if (f.type === 'boolean') out[f.key] = !!v;
    else if (v === '' || v == null) continue;
    else if (f.type === 'number') out[f.key] = Number(v);
    else out[f.key] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/** Field -> message for one task's config, from the kind's declared rules. */
export function configProblems(schema, config = {}) {
  const e = {};
  for (const f of fieldsOf(schema)) {
    const v = config[f.key];
    const blank = v === '' || v == null;
    if (f.type === 'boolean') continue;
    if (blank) {
      if (f.required) e[f.key] = `${f.label} is required`;
      continue;
    }
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) e[f.key] = 'Enter a number';
      else if (f.integer && !Number.isInteger(n)) e[f.key] = 'Enter a whole number';
      else if (f.min != null && n < f.min) e[f.key] = `At least ${f.min}`;
      else if (f.max != null && n > f.max) e[f.key] = `At most ${f.max}`;
    }
  }
  return e;
}

/**
 * The API's 400 `bad_event` `fields` -> { 'milestones.items.0.title': 'message' }.
 * Accepts an object map, or a list of { field|path, message|error }; `a[0].b` becomes `a.0.b`.
 */
export function normaliseFieldErrors(fields) {
  const out = {};
  const put = (path, msg) => {
    const k = String(path ?? '').replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
    if (k && msg) out[k] = typeof msg === 'string' ? msg : msg.message || msg.error || String(msg);
  };
  if (Array.isArray(fields)) fields.forEach((f) => put(f?.field ?? f?.path ?? f?.key, f?.message ?? f?.error ?? f?.msg));
  else if (fields && typeof fields === 'object') Object.entries(fields).forEach(([k, v]) => put(k, v));
  return out;
}

/** How many errors sit at or under a path ("milestones.items.3"). */
export const countUnder = (errors, prefix) => Object.keys(errors).filter((k) => k === prefix || k.startsWith(`${prefix}.`)).length;
