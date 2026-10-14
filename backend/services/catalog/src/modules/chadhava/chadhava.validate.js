import { HttpError } from '../../lib/http-error.js';

const bad = (message) => new HttpError(400, 'bad_listing', message);
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

const str = (v, max, what) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw bad(`${what} must be text.`);
  return v.trim().slice(0, max);
};
const when = (v, what) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`${what} is not a valid date.`);
  return d;
};
const arr = (v, max, what) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) throw bad(`${what} must be a list of at most ${max}.`);
  return v;
};

const LISTING_TEXT = ['title', 'titleHi', 'templeSlug', 'place', 'category', 'summary', 'summaryHi', 'banner', 'intro', 'introHi'];

/** `prepare` hook for the listings CRUD: whitelist, validate, and price-check the embedded offerings. */
export function prepareListing(body = {}, existing = null) {
  const o = { ...(existing ?? {}), ...body };
  if (typeof o.slug !== 'string' || !SLUG.test(o.slug)) throw bad('Slug must be lowercase letters, digits and - (up to 80).');
  const out = { slug: o.slug };
  for (const k of LISTING_TEXT) out[k] = str(o[k], k === 'intro' || k === 'introHi' ? 5000 : 300, k);
  if (!out.title) throw bad('Title is required.');
  out.gallery = arr(o.gallery, 20, 'gallery').map((x) => str(x, 300, 'gallery'));
  out.howItWorks = arr(o.howItWorks, 20, 'howItWorks').map((x) => ({ text: str(x?.text, 500, 'text'), textHi: str(x?.textHi, 500, 'textHi') }));
  out.startsAt = when(o.startsAt, 'startsAt');
  out.endsAt = when(o.endsAt, 'endsAt');
  if (out.startsAt && out.endsAt && out.endsAt <= out.startsAt) throw bad('endsAt must be after startsAt.');
  out.offerings = arr(o.offerings, 40, 'offerings').map((x, i) => {
    if (!x || typeof x.key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(x.key)) throw bad('Offering key must be lowercase letters, digits, - or _.');
    if (!Number.isInteger(x.coins) || x.coins < 1) throw bad(`Offering "${x.key}": coins must be a whole number, 1 or more.`);
    return {
      key: x.key, title: str(x.title, 120, 'title'), titleHi: str(x.titleHi, 120, 'titleHi'),
      desc: str(x.desc, 300, 'desc'), descHi: str(x.descHi, 300, 'descHi'), coins: x.coins, image: str(x.image, 300, 'image'),
      label: str(x.label, 40, 'label'), labelHi: str(x.labelHi, 40, 'labelHi'),
      order: Number.isFinite(Number(x.order)) && x.order !== undefined ? Number(x.order) : i, enabled: x.enabled !== false,
    };
  });
  if (new Set(out.offerings.map((x) => x.key)).size !== out.offerings.length) throw bad('Offering keys must be unique within a listing.');
  out.order = Number.isFinite(Number(o.order)) ? Number(o.order) : 0;
  out.enabled = o.enabled !== false;
  return out;
}

export function prepareCategory(body = {}, existing = null) {
  const o = { ...(existing ?? {}), ...body };
  if (typeof o.slug !== 'string' || !SLUG.test(o.slug)) throw bad('Slug must be lowercase letters, digits and - (up to 80).');
  const name = str(o.name, 120, 'name');
  if (!name) throw bad('Name is required.');
  return {
    slug: o.slug, name, nameHi: str(o.nameHi, 120, 'nameHi'), image: str(o.image, 300, 'image'),
    order: Number.isFinite(Number(o.order)) ? Number(o.order) : 0, enabled: o.enabled !== false,
  };
}
