import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

const arr = (r, key) => (Array.isArray(r) ? r : r?.[key] ?? []);

/**
 * What a slide can open: poojas, chadhava listings, temples. A list that fails
 * to load is empty (the stored slug still shows); `names` maps slug -> name for
 * the table, `options` are the <select> options.
 */
export function useTargets() {
  const poojas = useLoader(async () => arr(await api.poojas.list(), 'poojas'));
  const listings = useLoader(async () => arr(await api.chadhavaListings.list(), 'listings'));
  const temples = useLoader(async () => arr(await api.temples.list(), 'temples'));
  const map = (l, label) => Object.fromEntries((l.data || []).map((r) => [r.slug, label(r)]));
  const opts = (l, label) => (l.data || []).map((r) => ({ value: r.slug, label: label(r) || r.slug }));
  return {
    names: { poojas: map(poojas, (r) => r.title), listings: map(listings, (r) => r.title), temples: map(temples, (r) => r.name) },
    options: { poojas: opts(poojas, (r) => r.title), listings: opts(listings, (r) => r.title), temples: opts(temples, (r) => r.name) },
  };
}
