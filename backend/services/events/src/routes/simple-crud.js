import mongoose from 'mongoose';

import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { slugify } from '../events/validate.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-f]{6}$/i;

export const withId = (doc) => {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc.toObject ? doc.toObject() : doc;
  return { id: String(_id), _id, ...rest };
};

export function objectId(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'not_found', 'Not found.');
  return id;
}

/** Tiny field reader that raises 400 `<code>` with `fields`. */
export function fieldReader(code, input) {
  const fields = {};
  const src = isObj(input) ? input : {};
  if (!isObj(input)) fields[''] = 'Must be an object.';
  const add = (k, m) => { if (!(k in fields)) fields[k] = m; };
  return {
    src,
    fields,
    add,
    str(k, { max = 200, required = false } = {}) {
      const v = src[k];
      if (v === undefined || v === null || v === '') { if (required) add(k, 'Required.'); return ''; }
      if (typeof v !== 'string') { add(k, 'Must be text.'); return ''; }
      const s = v.trim();
      if (s.length > max) { add(k, `Too long (max ${max}).`); return s.slice(0, max); }
      if (required && !s) add(k, 'Required.');
      return s;
    },
    hex(k) {
      const v = src[k];
      if (v === undefined || v === null || v === '') return '';
      if (typeof v !== 'string' || !HEX.test(v.trim())) { add(k, 'Must be a colour like #7A1F2B.'); return ''; }
      return v.trim();
    },
    media(k) {
      const v = src[k];
      if (v === undefined || v === null || v === '') return '';
      if (typeof v !== 'string' || v.length > 500 || !/^(\/uploads\/|https:\/\/)/.test(v.trim())) { add(k, 'Must be an uploaded file (/uploads/...) or an https link.'); return ''; }
      return v.trim();
    },
    slug(k, fallbackFrom) {
      const v = src[k];
      const s = typeof v === 'string' && v.trim() ? v.trim() : slugify(fallbackFrom);
      if (!s || !SLUG.test(s) || s.length > 60) { add(k, 'Use lowercase letters, digits and - (up to 60).'); return ''; }
      return s;
    },
    finish() {
      if (Object.keys(fields).length) throw new HttpError(400, code, 'Some fields need fixing.', { fields });
    },
  };
}

/** Duplicate key (slug) -> 409 slug_taken; everything else rethrown. */
export const duplicateAsConflict = (e) => {
  if (e?.code === 11000) throw new HttpError(409, 'slug_taken', 'Another item already uses that slug.', { fields: { slug: 'Already used.' } });
  throw e;
};

export { asyncRouter, isObj };
