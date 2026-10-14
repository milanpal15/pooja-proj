import { istToday } from './ist.js';

/**
 * The booking eligibility rules a pooja snapshot is judged by - the monolith's modules/poojas/pooja.service.js (`enabledPackages`,
 * `isBookable`), moved with the purchase. The inputs are catalog's priced snapshot (dates already `Date`s), so catalog owns the facts and
 * this service owns what a purchase does with them. Copied, not shared: a rule changed in one place must be changed in the catalog's
 * (listing/status) copy too - the pooja definition carries the same fields.
 */
export const enabledPackages = (p) => (p.packages ?? []).filter((k) => k.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const published = (p, now) => !p.publishAt || new Date(p.publishAt) <= now;
const closed = (p, now) => !!p.bookingClosesAt && new Date(p.bookingClosesAt) <= now;
const dateGone = (p, now) => !!p.poojaDate && p.poojaDate < istToday(now);

/** Can a devotee book it right now? (enabled, published, a package, window open, not past.) */
export const isBookable = (p, now = new Date()) =>
  p.enabled !== false && published(p, now) && enabledPackages(p).length > 0 && !closed(p, now) && !dateGone(p, now);
