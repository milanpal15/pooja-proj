import { idOf } from '../../../lib/ids.js';

/** Pure helpers for chadhava listings and their offerings. */
export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

let seq = 0;
const cid = () => `o${Date.now().toString(36)}${(seq += 1)}`;

export const blankOffering = () => ({ _cid: cid(), _stored: false, key: '', title: '', titleHi: '', desc: '', descHi: '', coins: '', image: '', label: '', labelHi: '', enabled: true });

export const blankListing = () => ({
  slug: '',
  title: '',
  titleHi: '',
  templeSlug: '',
  place: '',
  category: '',
  startsAt: null,
  endsAt: null,
  banner: '',
  gallery: [],
  intro: '',
  introHi: '',
  howItWorks: [],
  offerings: [],
  enabled: true,
  order: 0,
});

/** A stored listing -> draft (offerings sorted and given client ids; stored keys locked). */
export function toDraft(doc) {
  return {
    ...blankListing(),
    ...doc,
    gallery: doc.gallery || [],
    howItWorks: doc.howItWorks || [],
    offerings: (doc.offerings || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((o) => ({ ...blankOffering(), ...o, _stored: !!o.key, enabled: o.enabled !== false })),
  };
}

/** Keys for new offerings from their titles, unique among the listing's; stored keys are kept. */
export function assignKeys(offerings) {
  const taken = new Set(offerings.filter((o) => o._stored && o.key).map((o) => o.key));
  return offerings.map((o, i) => {
    if (o._stored && o.key) return o;
    const base = slugify(o.title) || `offering-${i + 1}`;
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
    taken.add(key);
    return { ...o, key };
  });
}

/** Errors for one offering ({} = fine). */
export function validateOffering(o) {
  const e = {};
  if (!o.title.trim()) e.title = 'Name it';
  const coins = Number(o.coins);
  if (o.coins === '' || !Number.isInteger(coins) || coins < 1) e.coins = 'Whole coins, at least 1';
  return e;
}

export function validateListing(d) {
  const errors = { offerings: {} };
  if (!slugify(d.slug) || slugify(d.slug) !== d.slug) errors.slug = 'Lowercase letters, numbers and dashes only';
  if (!d.title.trim()) errors.title = 'Give the listing a title';
  if (d.startsAt && d.endsAt && new Date(d.startsAt) > new Date(d.endsAt)) errors.endsAt = '“Ends” is before “Starts”';
  d.offerings.forEach((o) => {
    const e = validateOffering(o);
    if (Object.keys(e).length) errors.offerings[o._cid] = e;
  });
  return Object.keys(errors.offerings).length || Object.keys(errors).length > 1 ? errors : {};
}

/** Request body: client fields dropped, numbers coerced, order = position. */
export function toPayload(d) {
  const offerings = assignKeys(d.offerings).map((o, i) => {
    const { _cid, _stored, ...rest } = o;
    return { ...rest, coins: Number(o.coins), order: i + 1 };
  });
  return { ...d, offerings };
}

/** Every offering across listings, each with its parent: the Offerings tab's rows. */
export function flattenOfferings(listings) {
  return listings.flatMap((l) =>
    (l.offerings || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((o) => ({ ...o, listingId: idOf(l), listingTitle: l.title, listingSlug: l.slug, category: l.category })),
  );
}

/** live / scheduled / ended / hidden from `enabled` and the window. */
export function listingStatus(l, now = Date.now()) {
  if (!l.enabled) return 'hidden';
  if (l.startsAt && new Date(l.startsAt).getTime() > now) return 'scheduled';
  if (l.endsAt && new Date(l.endsAt).getTime() < now) return 'ended';
  return 'live';
}

export const STATUS_TONE = { live: 'success', scheduled: 'info', ended: 'outline', hidden: 'neutral' };
export const STATUS_LABEL = { live: 'Live', scheduled: 'Scheduled', ended: 'Ended', hidden: 'Hidden' };
