/** Small helpers shared by the task-kind modules. A kind's `validate` returns `{ config, errors, refs }`; it never throws. */

export const REF_SLUG = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

export class NotImplementedError extends Error {
  constructor(kind, what = 'evaluate') {
    super('not implemented');
    this.name = 'NotImplementedError';
    this.kind = kind;
    this.what = what;
  }
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Pulls typed values out of a raw config, collecting `{ field, message }` errors instead of throwing. */
export function reader(raw, errors) {
  const src = isPlainObject(raw) ? raw : {};
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) errors.push({ field: '', message: 'config must be an object.' });
  const bad = (field, message) => errors.push({ field, message });
  return {
    int(field, { min, max, required = true, def } = {}) {
      const v = src[field];
      if (v === undefined || v === null || v === '') {
        if (required) bad(field, `${field} is required.`);
        return def ?? null;
      }
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (!Number.isInteger(n)) { bad(field, `${field} must be a whole number.`); return null; }
      if (min !== undefined && n < min) { bad(field, `${field} must be at least ${min}.`); return null; }
      if (max !== undefined && n > max) { bad(field, `${field} must be at most ${max}.`); return null; }
      return n;
    },
    num(field, { min, max, required = true } = {}) {
      const v = src[field];
      if (v === undefined || v === null || v === '') {
        if (required) bad(field, `${field} is required.`);
        return null;
      }
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) { bad(field, `${field} must be a number.`); return null; }
      if (min !== undefined && n < min) { bad(field, `${field} must be at least ${min}.`); return null; }
      if (max !== undefined && n > max) { bad(field, `${field} must be at most ${max}.`); return null; }
      return n;
    },
    str(field, { max = 120, required = false } = {}) {
      const v = src[field];
      if (v === undefined || v === null || v === '') {
        if (required) bad(field, `${field} is required.`);
        return '';
      }
      if (typeof v !== 'string') { bad(field, `${field} must be text.`); return ''; }
      const s = v.trim();
      if (s.length > max) { bad(field, `${field} is too long (max ${max}).`); return s.slice(0, max); }
      if (required && !s) bad(field, `${field} is required.`);
      return s;
    },
    slug(field, required = true) {
      const v = src[field];
      if (v === undefined || v === null || v === '') {
        if (required) bad(field, `${field} is required.`);
        return '';
      }
      if (typeof v !== 'string' || !REF_SLUG.test(v.trim())) { bad(field, `${field} is not a valid slug.`); return ''; }
      return v.trim();
    },
    bool(field, def) {
      const v = src[field];
      if (v === undefined || v === null) return def;
      if (typeof v !== 'boolean') { bad(field, `${field} must be true or false.`); return def; }
      return v;
    },
  };
}

/** The empty configSchema: JSON-Schema subset the dashboard turns into a form (`x-ref` names the catalog thing a slug points at). */
export const noConfig = { type: 'object', properties: {}, required: [] };

export const bilingual = (en, hi) => ({ en, hi });
export const pick = (lang, en, hi) => (lang === 'hi' ? hi : en);
