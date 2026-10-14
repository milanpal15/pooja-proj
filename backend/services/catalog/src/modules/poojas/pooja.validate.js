import { HttpError } from '../../lib/http-error.js';
import { validDate } from '../../lib/ist.js';

const bad = (message) => new HttpError(400, 'bad_pooja', message);

const TEXT = ['title', 'titleHi', 'tagline', 'taglineHi', 'banner', 'templeSlug', 'place', 'festivalSlug', 'tithi', 'deitySlug', 'about', 'aboutHi', 'templeAbout', 'templeAboutHi', 'templeImage'];
const FIELDS = [
  ...TEXT, 'slug', 'poojaDate', 'bookingClosesAt', 'cancelHours', 'publishAt', 'gallery', 'benefits', 'included', 'process', 'faqs',
  'prasadAvailable', 'prasadFeeCoins', 'packages', 'enabled', 'order',
];

const str = (v, max, what) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw bad(`${what} must be text.`);
  return v.trim().slice(0, max);
};
const list = (v, max, what) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) throw bad(`${what} must be a list of at most ${max}.`);
  return v;
};
const obj = (v, what) => {
  if (!v || typeof v !== 'object') throw bad(`${what} entries must be objects.`);
  return v;
};
const when = (v, what) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`${what} is not a valid date.`);
  return d;
};

function cleanPackage(raw, i) {
  const p = obj(raw, 'packages');
  if (typeof p.key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(p.key)) throw bad('Package key must be lowercase letters, digits, - or _.');
  if (!Number.isInteger(p.persons) || p.persons < 1 || p.persons > 12) throw bad(`Package "${p.key}": persons must be a whole number from 1 to 12.`);
  if (!Number.isInteger(p.coins) || p.coins < 1) throw bad(`Package "${p.key}": coins must be a whole number, 1 or more.`);
  return {
    key: p.key,
    name: str(p.name, 120, 'name'),
    nameHi: str(p.nameHi, 120, 'nameHi'),
    persons: p.persons,
    coins: p.coins,
    perks: list(p.perks, 20, 'perks').map((x) => str(x, 200, 'perks')),
    perksHi: list(p.perksHi, 20, 'perksHi').map((x) => str(x, 200, 'perksHi')),
    image: str(p.image, 300, 'image'),
    order: Number.isFinite(Number(p.order)) && p.order !== undefined ? Number(p.order) : i,
    enabled: p.enabled !== false,
  };
}

/**
 * Whitelist + validate a pooja body. `base` is the stored row on update, so a
 * partial PUT is checked as the merged document. Returns the data to store.
 */
export function cleanPooja(body, base = {}) {
  const o = { ...base };
  for (const k of FIELDS) if (body?.[k] !== undefined) o[k] = body[k];

  if (typeof o.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(o.slug)) throw bad('Slug must be lowercase letters, digits and - (up to 80).');
  for (const k of TEXT) if (o[k] !== undefined) o[k] = str(o[k], k === 'about' || k === 'aboutHi' || k === 'templeAbout' || k === 'templeAboutHi' ? 5000 : 300, k);
  if (!o.title) throw bad('Title is required.');

  if (o.poojaDate === undefined || o.poojaDate === null || o.poojaDate === '') o.poojaDate = null;
  else if (!validDate(o.poojaDate)) throw bad('poojaDate must be YYYY-MM-DD.');
  o.bookingClosesAt = when(o.bookingClosesAt, 'bookingClosesAt');
  o.publishAt = when(o.publishAt, 'publishAt');

  if (o.cancelHours === undefined) o.cancelHours = 24;
  if (!Number.isInteger(o.cancelHours) || o.cancelHours < 0 || o.cancelHours > 720) throw bad('cancelHours must be a whole number from 0 to 720.');
  if (o.prasadFeeCoins === undefined) o.prasadFeeCoins = 0;
  if (!Number.isInteger(o.prasadFeeCoins) || o.prasadFeeCoins < 0) throw bad('prasadFeeCoins must be a whole number, 0 or more.');
  if (o.order !== undefined && !Number.isFinite(Number(o.order))) throw bad('order must be a number.');
  if (o.order !== undefined) o.order = Number(o.order);

  o.gallery = list(o.gallery, 20, 'gallery').map((x) => str(x, 300, 'gallery'));
  const titled = (rows, what) => list(rows, 30, what).map((r) => {
    const x = obj(r, what);
    return { title: str(x.title, 200, 'title'), titleHi: str(x.titleHi, 200, 'titleHi'), text: str(x.text, 1000, 'text'), textHi: str(x.textHi, 1000, 'textHi') };
  });
  o.benefits = titled(o.benefits, 'benefits');
  o.process = titled(o.process, 'process');
  o.included = list(o.included, 30, 'included').map((r) => ({ text: str(obj(r, 'included').text, 300, 'text'), textHi: str(r.textHi, 300, 'textHi') }));
  o.faqs = list(o.faqs, 30, 'faqs').map((r) => {
    const x = obj(r, 'faqs');
    return { q: str(x.q, 300, 'q'), qHi: str(x.qHi, 300, 'qHi'), a: str(x.a, 1500, 'a'), aHi: str(x.aHi, 1500, 'aHi') };
  });

  o.packages = list(o.packages, 12, 'packages').map(cleanPackage);
  const keys = o.packages.map((p) => p.key);
  if (new Set(keys).size !== keys.length) throw bad('Package keys must be unique within a pooja.');

  o.prasadAvailable = o.prasadAvailable === true;
  o.enabled = o.enabled !== false;
  delete o._id; delete o.createdAt; delete o.updatedAt; delete o.__v;
  return o;
}
