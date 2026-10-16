import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

const arr = (r, key) => (Array.isArray(r) ? r : r?.[key] ?? []);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

/**
 * What an event refers to, loaded the way features/live does it: event types,
 * badges, the task-kind registry, and the catalogues a task config can point
 * at (streams, chadhava listings, poojas, temples, aartis). A list that fails
 * to load is empty (the stored slug still shows in its select).
 */
export function useLookups() {
  const types = useLoader(async () => arr(await api.eventTypes.list(), 'types'));
  const badges = useLoader(async () => arr(await api.eventBadges.list(), 'badges'));
  const kinds = useLoader(async () => api.events.taskKinds());
  const streams = useLoader(async () => arr(await api.liveStreams.list(), 'streams'));
  const listings = useLoader(async () => arr(await api.chadhavaListings.list(), 'listings'));
  const poojas = useLoader(async () => arr(await api.poojas.list(), 'poojas'));
  const temples = useLoader(async () => arr(await api.temples.list(), 'temples'));
  const aartis = useLoader(async () => arr(await api.aartis.list(), 'aartis'));
  const t = (types.data || []).slice().sort(byOrder);
  const templeName = (slug) => (temples.data || []).find((x) => x.slug === slug)?.name || slug;
  return {
    types: t,
    badges: badges.data || [],
    kinds: kinds.data || [],
    kindsStatus: kinds.status,
    kindsError: kinds.error,
    reloadKinds: kinds.reload,
    reloadTypes: types.reload,
    reloadBadges: badges.reload,
    typeOf: (slug) => t.find((x) => x.slug === slug),
    kindOf: (kind) => (kinds.data || []).find((k) => k.kind === kind),
    /** ref name (see lib/schema.js) -> [{ value, label }] */
    options: {
      streams: (streams.data || []).map((s) => ({ value: s.slug || s.templeSlug, label: templeName(s.templeSlug) || s.slug })),
      listings: (listings.data || []).map((l) => ({ value: l.slug, label: l.title || l.slug })),
      poojas: (poojas.data || []).map((p) => ({ value: p.slug, label: p.title || p.slug })),
      temples: (temples.data || []).map((x) => ({ value: x.slug, label: x.name || x.slug })),
      aartis: (aartis.data || []).map((a) => ({ value: a.slug || a.id || a._id, label: a.title || a.name || a.slug })),
      badges: (badges.data || []).map((b) => ({ value: b.slug, label: b.name || b.slug })),
    },
  };
}
