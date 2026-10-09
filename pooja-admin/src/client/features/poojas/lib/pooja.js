/**
 * Pure helpers for the pooja editor: blank documents, package keys and
 * validation, and the payload sent to the API. No React, no network.
 */
export const MAX_PERSONS = 12;

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

let seq = 0;
/** A client-only id so React can key rows that have no stored key yet. Never sent. */
const cid = () => `c${Date.now().toString(36)}${(seq += 1)}`;

export const blankPackage = (n = 1) => ({
  _cid: cid(),
  _stored: false,
  key: '',
  name: '',
  nameHi: '',
  persons: n,
  coins: '',
  perksText: '',
  perksHiText: '',
  image: '',
  enabled: true,
});

export const blankPooja = () => ({
  slug: '',
  title: '',
  titleHi: '',
  tagline: '',
  taglineHi: '',
  templeSlug: '',
  place: '',
  festivalSlug: '',
  tithi: '',
  deitySlug: '',
  poojaDate: '',
  bookingClosesAt: null,
  cancelHours: 24,
  publishAt: null,
  gallery: [],
  about: '',
  aboutHi: '',
  benefits: [],
  included: [],
  process: [],
  faqs: [],
  templeAbout: '',
  templeAboutHi: '',
  templeImage: '',
  prasadAvailable: false,
  prasadFeeCoins: 0,
  packages: [blankPackage(1)],
  enabled: false,
});

/** A stored document -> the editor's draft (perks as one line each; stored keys are locked). */
export function toDraft(doc) {
  const base = blankPooja();
  const d = { ...base, ...doc };
  d.poojaDate = doc.poojaDate || '';
  d.gallery = doc.gallery || [];
  for (const k of ['benefits', 'included', 'process', 'faqs']) d[k] = doc[k] || [];
  d.packages = (doc.packages || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => ({
      ...blankPackage(),
      ...p,
      _stored: !!p.key,
      perksText: (p.perks || []).join('\n'),
      perksHiText: (p.perksHi || []).join('\n'),
      enabled: p.enabled !== false,
    }));
  return d;
}

const lines = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Keys for every package: stored ones are kept (bookings reference them); new ones come from the name, made unique. */
export function assignKeys(packages) {
  const taken = new Set(packages.filter((p) => p._stored && p.key).map((p) => p.key));
  return packages.map((p, i) => {
    if (p._stored && p.key) return p;
    const base = slugify(p.name) || `package-${i + 1}`;
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
    taken.add(key);
    return { ...p, key };
  });
}

/** What is wrong with the draft ({} = fine). `publish` additionally needs a visible package. */
export function validatePooja(d, { publish = false } = {}) {
  const errors = { packages: {} };
  if (!slugify(d.slug) || slugify(d.slug) !== d.slug) errors.slug = 'Lowercase letters, numbers and dashes only';
  if (!d.title.trim()) errors.title = 'Give the pooja a title';
  if (d.poojaDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.poojaDate)) errors.poojaDate = 'Use a date';
  if (!Number.isInteger(Number(d.cancelHours)) || Number(d.cancelHours) < 0) errors.cancelHours = 'A whole number of hours';
  if (d.prasadAvailable && (!Number.isInteger(Number(d.prasadFeeCoins)) || Number(d.prasadFeeCoins) < 0)) errors.prasadFeeCoins = 'A whole number of coins';
  d.packages.forEach((p) => {
    const e = {};
    if (!p.name.trim()) e.name = 'Name it';
    const persons = Number(p.persons);
    if (!Number.isInteger(persons) || persons < 1 || persons > MAX_PERSONS) e.persons = `1 to ${MAX_PERSONS}`;
    const coins = Number(p.coins);
    if (p.coins === '' || !Number.isInteger(coins) || coins < 1) e.coins = 'Whole coins, at least 1';
    if (Object.keys(e).length) errors.packages[p._cid] = e;
  });
  if (publish && !d.packages.some((p) => p.enabled)) errors.packagesGeneral = 'Publishing needs at least one visible package';
  const bad = Object.keys(errors.packages).length || errors.packagesGeneral || Object.keys(errors).some((k) => k !== 'packages');
  return bad ? errors : {};
}

/** The request body: client-only fields dropped, perks back to arrays, order = position. */
export function toPayload(d, { enabled }) {
  const packages = assignKeys(d.packages).map((p, i) => {
    const { _cid, _stored, perksText, perksHiText, ...rest } = p;
    return { ...rest, persons: Number(p.persons), coins: Number(p.coins), perks: lines(perksText), perksHi: lines(perksHiText), order: i + 1 };
  });
  return {
    ...d,
    poojaDate: d.poojaDate || null,
    cancelHours: Number(d.cancelHours),
    prasadFeeCoins: d.prasadAvailable ? Number(d.prasadFeeCoins) : 0,
    packages,
    enabled,
  };
}

/** A copy of a stored pooja to start from: new slug, hidden, no bookings. */
export function duplicateOf(doc) {
  const { _id, id, bookingCount, status, createdAt, updatedAt, __v, ...rest } = doc;
  return { ...rest, slug: `${doc.slug}-copy`, title: `${doc.title} (copy)`, enabled: false };
}

/** "551 – 1,651" over the visible packages (null when none). */
export function priceRange(packages = []) {
  const coins = packages.filter((p) => p.enabled !== false).map((p) => p.coins).filter((c) => Number.isFinite(c));
  if (!coins.length) return null;
  const fmt = (n) => n.toLocaleString('en-IN');
  const lo = Math.min(...coins);
  const hi = Math.max(...coins);
  return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
}
