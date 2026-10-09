import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

const arr = (r, key) => (Array.isArray(r) ? r : r?.[key] ?? []);

/**
 * What a stream refers to: temples, chadhava listings, poojas and live
 * categories. A list that fails to load is empty (the stored slug still shows).
 */
export function useLookups() {
  const temples = useLoader(async () => arr(await api.temples.list(), 'temples'));
  const listings = useLoader(async () => arr(await api.chadhavaListings.list(), 'listings'));
  const poojas = useLoader(async () => arr(await api.poojas.list(), 'poojas'));
  const categories = useLoader(async () => arr(await api.liveCategories.list(), 'categories'));
  const t = temples.data || [];
  const byTemple = Object.fromEntries(t.map((r) => [r.slug, r]));
  return {
    temples: t,
    listings: listings.data || [],
    poojas: poojas.data || [],
    categories: (categories.data || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    reloadCategories: categories.reload,
    templeName: (slug) => byTemple[slug]?.name || slug || '—',
    templeOf: (slug) => byTemple[slug],
    categoryName: (slug) => (categories.data || []).find((c) => c.slug === slug)?.name || '',
  };
}
