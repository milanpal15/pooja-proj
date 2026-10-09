import { authedFetch, publicFetch } from './client';
import { qs } from './query';

export type ChadhavaCategory = { slug: string; name: string; nameHi: string; image: string };

export type ChadhavaListingCard = {
  slug: string;
  title: string;
  titleHi: string;
  banner: string;
  templeName: string;
  place: string;
  /** ISO, or null when the listing has no window. */
  startsAt: string | null;
  endsAt: string | null;
  category: string;
  summary: string;
  summaryHi: string;
  fromCoins: number;
};

export type ChadhavaOfferingItem = {
  key: string;
  title: string;
  titleHi: string;
  desc: string;
  descHi: string;
  coins: number;
  image: string;
  /** Ribbon text such as "Most offered"; empty for none. */
  label: string;
  labelHi: string;
};

export type ChadhavaListingDetail = ChadhavaListingCard & {
  gallery: string[];
  intro: string;
  introHi: string;
  howItWorks: { text: string; textHi: string }[];
  offerings: ChadhavaOfferingItem[];
};

export async function fetchChadhavaListings(category?: string) {
  const res = await publicFetch<{
    listings?: ChadhavaListingCard[];
    categories?: ChadhavaCategory[];
  }>(`/api/chadhava/listings${qs({ category })}`);
  return { listings: res.listings ?? [], categories: res.categories ?? [] };
}

export async function fetchChadhavaListing(slug: string) {
  const { listing } = await publicFetch<{ listing: ChadhavaListingDetail }>(
    `/api/chadhava/listings/${encodeURIComponent(slug)}`,
  );
  return listing;
}

/** Only what was chosen. Qty 1-20, at most 10 distinct items; the server prices it. */
export type NewChadhavaOrder = {
  listingSlug: string;
  items: { key: string; qty: number }[];
  requestId: string;
};

export type ChadhavaOrder = {
  id: string;
  /** "CHD-…" */
  ref: string;
  listingTitle: string;
  items: { key: string; title: string; qty: number; coins: number }[];
  totalCoins: number;
  status: 'booked' | 'offered' | 'cancelled';
  createdAt: string;
};

export function createChadhavaOrder(body: NewChadhavaOrder) {
  return authedFetch('/api/chadhava/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<{ order: ChadhavaOrder; balance?: number }>;
}

export async function fetchChadhavaOrders(): Promise<ChadhavaOrder[]> {
  const { orders } = (await authedFetch('/api/chadhava/orders')) as { orders?: ChadhavaOrder[] };
  return orders ?? [];
}

/** Refunds while `booked` and before the listing ends. */
export function cancelChadhavaOrder(id: string) {
  return authedFetch(`/api/chadhava/orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  }) as Promise<{ order?: ChadhavaOrder; balance?: number }>;
}
