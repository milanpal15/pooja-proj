import { publicFetch } from './client';
import { qs } from './query';

/** One card on the Pooja Seva list. `status: 'closing'` = closes within 48 hours. */
export type PoojaCard = {
  slug: string;
  title: string;
  titleHi: string;
  tagline: string;
  taglineHi: string;
  banner: string;
  templeSlug: string;
  templeName: string;
  place: string;
  /** `YYYY-MM-DD`, or null for "every day". */
  poojaDate: string | null;
  tithi: string;
  festivalSlug: string;
  festivalName: string;
  fromCoins: number;
  toCoins: number;
  packageCount: number;
  status: 'open' | 'closing';
};

export type PoojaFilters = {
  temples: { slug: string; name: string }[];
  festivals: { slug: string; name: string; nameHi?: string }[];
  tithis: string[];
  places: string[];
};

export type PoojaQuery = {
  temple?: string;
  festival?: string;
  tithi?: string;
  place?: string;
  q?: string;
};

export type PoojaPackage = {
  key: string;
  name: string;
  nameHi: string;
  persons: number;
  coins: number;
  perks: string[];
  perksHi: string[];
  image: string;
};

export type PoojaDetail = PoojaCard & {
  gallery: string[];
  about: string;
  aboutHi: string;
  benefits: { title: string; titleHi: string; text: string; textHi: string }[];
  included: { text: string; textHi: string }[];
  process: { title: string; titleHi: string; text: string; textHi: string }[];
  faqs: { q: string; qHi: string; a: string; aHi: string }[];
  temple: { slug: string; name: string; about: string; aboutHi: string; image: string } | null;
  /** ISO. Null = no deadline. */
  bookingClosesAt: string | null;
  cancelHours: number;
  prasadAvailable: boolean;
  prasadFeeCoins: number;
  packages: PoojaPackage[];
  /** Null until at least one visible review exists. */
  rating: { avg: number; count: number } | null;
};

export type PoojaReview = {
  id: string;
  /** First name only — the API never returns contact details. */
  name: string;
  rating: number;
  text: string;
  createdAt: string;
  packageName: string;
};

export async function fetchPoojas(query: PoojaQuery = {}) {
  const res = await publicFetch<{ poojas?: PoojaCard[]; filters?: Partial<PoojaFilters> }>(
    `/api/poojas${qs(query)}`,
  );
  return {
    poojas: res.poojas ?? [],
    filters: {
      temples: res.filters?.temples ?? [],
      festivals: res.filters?.festivals ?? [],
      tithis: res.filters?.tithis ?? [],
      places: res.filters?.places ?? [],
    } satisfies PoojaFilters,
  };
}

export async function fetchPooja(slug: string) {
  const { pooja } = await publicFetch<{ pooja: PoojaDetail }>(`/api/poojas/${encodeURIComponent(slug)}`);
  return pooja;
}

export async function fetchPoojaReviews(slug: string, opts: { limit?: number; before?: string } = {}) {
  const { reviews } = await publicFetch<{ reviews?: PoojaReview[] }>(
    `/api/poojas/${encodeURIComponent(slug)}/reviews${qs(opts)}`,
  );
  return reviews ?? [];
}
