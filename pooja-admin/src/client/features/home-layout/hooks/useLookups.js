import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

const arr = (r, key) => (Array.isArray(r) ? r : r?.[key] ?? []);

/**
 * What an action ref or an item's deity can point at, loaded from the lists the
 * dashboard already has. A list that fails to load is empty: the stored value
 * still shows in its select, so nothing is lost.
 */
export function useLookups() {
  const poojas = useLoader(async () => arr(await api.poojas.list(), 'poojas'));
  const listings = useLoader(async () => arr(await api.chadhavaListings.list(), 'listings'));
  const temples = useLoader(async () => arr(await api.temples.list(), 'temples'));
  const events = useLoader(async () => arr(await api.events.list(), 'events'));
  const categories = useLoader(async () => arr(await api.chadhavaCategories.list(), 'categories'));
  const deities = useLoader(async () => arr(await api.deities.list(), 'deities'));
  const opt = (rows, label) => (rows.data || []).filter((r) => r.slug).map((r) => ({ value: r.slug, label: label(r) || r.slug }));
  return {
    options: {
      poojas: opt(poojas, (r) => r.title || r.name),
      listings: opt(listings, (r) => r.title || r.name),
      temples: opt(temples, (r) => r.name || r.title),
      events: opt(events, (r) => r.title || r.name),
      categories: opt(categories, (r) => r.title || r.name),
      deities: opt(deities, (r) => r.name || r.title),
    },
  };
}
