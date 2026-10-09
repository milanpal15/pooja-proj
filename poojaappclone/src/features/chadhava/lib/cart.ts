import type { ChadhavaListingCard, ChadhavaOfferingItem } from '@/lib/api';

/** The server's limits (POOJA_AND_HOME.md §4.2) — enforced here only to keep the stepper honest. */
export const MAX_QTY = 20;
export const MAX_DISTINCT = 10;

export type Cart = Record<string, number>;

/** Add `delta` of one offering. Clamped to 0..20; an 11th distinct item is refused. */
export function bump(cart: Cart, key: string, delta: number): Cart {
  const current = cart[key] ?? 0;
  const next = Math.min(MAX_QTY, Math.max(0, current + delta));
  if (next === current) return cart;
  const out = { ...cart, [key]: next };
  if (next === 0) delete out[key];
  return Object.keys(out).length > MAX_DISTINCT ? cart : out;
}

export const cartCount = (cart: Cart): number => Object.values(cart).reduce((n, q) => n + q, 0);

/** Σ coins × qty over offerings still on sale. DISPLAY ONLY — the server prices the order. */
export function cartTotal(offerings: readonly Pick<ChadhavaOfferingItem, 'key' | 'coins'>[], cart: Cart): number {
  return offerings.reduce((sum, o) => sum + o.coins * (cart[o.key] ?? 0), 0);
}

/** The wire shape: chosen items only, in a stable order (so the idempotency signature is stable). */
export function cartItems(cart: Cart): { key: string; qty: number }[] {
  return Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([key, qty]) => ({ key, qty }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Route-param form: `gau:2,deep:1`. */
export const encodeCart = (cart: Cart): string =>
  cartItems(cart)
    .map((i) => `${i.key}:${i.qty}`)
    .join(',');

/** Parse the route param back; junk entries are ignored, quantities clamped. */
export function decodeCart(raw: string | undefined): Cart {
  const cart: Cart = {};
  for (const part of (raw ?? '').split(',')) {
    const [key, q] = part.split(':');
    const qty = Math.min(MAX_QTY, Math.floor(Number(q)));
    if (key && Number.isFinite(qty) && qty > 0 && Object.keys(cart).length < MAX_DISTINCT) cart[key] = qty;
  }
  return cart;
}

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Listings at one temple (plus those tied to none, which are offered everywhere). The card carries the temple's NAME, not its slug,
 * so match on either the slugified name or the name itself (the Temples tab
 * passes a slug and knows the name).
 */
export function listingsForTemple(
  listings: ChadhavaListingCard[],
  templeSlug: string | undefined,
  templeName?: string,
): ChadhavaListingCard[] {
  if (!templeSlug) return listings;
  const want = slugOf(templeSlug);
  const wantName = templeName ? slugOf(templeName) : '';
  return listings.filter((l) => {
    const have = slugOf(l.templeName);
    // A listing tied to no temple is offered at every temple, as the pooja list treats it.
    return !have || have === want || (!!wantName && have === wantName);
  });
}
