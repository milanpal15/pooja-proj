/**
 * The ONE table mapping every `/api` path (as the gate sees it, i.e. without
 * the `/api` prefix) to an area — DESIGN.md §21.5.
 *
 * GET/HEAD need `<area>:view`; every other method needs `<area>:edit`.
 * A path with no entry here resolves to `operators` (admin-only): a new route
 * is private until someone names its area. A test fails if any registered
 * `/api/admin/*` route is missing.
 *
 * First match wins, so put the specific (`push`) before the general.
 */
export const ROUTE_AREAS = [
  { path: /^\/admin\/announcements\/[^/]+\/push$/, area: 'push' },

  // Content
  { path: /^\/content\/horoscopes(\/|$)/, area: 'horoscope' },
  { path: /^\/horoscope\/day\/[^/]+$/, area: 'horoscope' },
  { path: /^\/content\/panchangs(\/|$)/, area: 'panchang' },
  { path: /^\/content\/announcements(\/|$)/, area: 'announcements' },
  { path: /^\/content\/upload$/, area: 'content' },
  { path: /^\/content(\/|$)/, area: 'content' }, // deities, temples, aartis, … settings (money keys guarded separately)
  { path: /^\/admin\/(offerings|home-sections|poojas|chadhava-listings|chadhava-categories|live-streams|live-categories)(\/|$)/, area: 'content' },

  { path: /^\/flags(\/|$)/, area: 'flags' },
  { path: /^\/admin\/policies(\/|$)/, area: 'policies' },
  { path: /^\/users(\/|$)/, area: 'devotees' },
  { path: /^\/admin\/operators(\/|$)/, area: 'operators' },
  { path: /^\/admin\/audit-log$/, area: 'operators' },

  { path: /^\/(analytics|visitors)(\/|$)/, area: 'overview' },

  { path: /^\/admin\/astrologers(\/|$)/, area: 'astrologers' },
  { path: /^\/admin\/(coin-packs|coin-stats|billing)(\/|$)/, area: 'money' },
  { path: /^\/admin\/(coin-orders|bookings|reviews|chadhava-orders)(\/|$)/, area: 'orders' },
  // Looking a wallet up is a search over names and phones, so it also needs `devotees:view`.
  { path: /^\/admin\/wallets$/, area: 'wallets', also: 'devotees:view' },
  { path: /^\/admin\/(wallets?|wallet-transactions)(\/|$)/, area: 'wallets' },
  { path: /^\/admin\/calls(\/|$)/, area: 'calls' },
  { path: /^\/admin\/payouts(\/|$)/, area: 'payouts' },
];

/** `{ area, level, also }` for a request. Unmapped paths are `operators:<level>` (admin-only). */
export function areaFor(method, path) {
  const level = method === 'GET' || method === 'HEAD' ? 'view' : 'edit';
  const hit = ROUTE_AREAS.find((r) => r.path.test(path));
  return { area: hit ? hit.area : 'operators', level, mapped: !!hit, also: hit?.also };
}
