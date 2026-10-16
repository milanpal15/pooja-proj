// COPIED from pooja-api/src/access/routes.js. access-parity.test.mjs fails when the two drift.
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
  // Users 360 and blocking (identity; BFF-only, docs/USERS.md). The CSV export is a bulk copy of personal data, so reading it also needs `devotees:edit`.
  { path: /^\/admin\/users\/export$/, area: 'devotees', also: 'devotees:edit' },
  { path: /^\/admin\/(users|blocked-devices)(\/|$)/, area: 'devotees' },
  { path: /^\/admin\/operators(\/|$)/, area: 'operators' },
  // The audit log has its own area here (admin only): docs/RELEASES.md section 5. pooja-api still maps it to `operators`; the parity test knows.
  { path: /^\/admin\/audit-log$/, area: 'audit' },

  { path: /^\/(analytics|visitors)(\/|$)/, area: 'overview' },

  { path: /^\/admin\/astrologers(\/|$)/, area: 'astrologers' },
  { path: /^\/admin\/(coin-packs|coin-stats|billing)(\/|$)/, area: 'money' },
  { path: /^\/admin\/(coin-orders|bookings|reviews|chadhava-orders)(\/|$)/, area: 'orders' },
  // Looking a wallet up is a search over names and phones, so it also needs `devotees:view`.
  { path: /^\/admin\/wallets$/, area: 'wallets', also: 'devotees:view' },
  { path: /^\/admin\/(wallets?|wallet-transactions)(\/|$)/, area: 'wallets' },
  { path: /^\/admin\/calls(\/|$)/, area: 'calls' },
  { path: /^\/admin\/payouts(\/|$)/, area: 'payouts' },

  // Home layout v2 (catalog; BFF-only like events: pooja-api has no such route, the parity test skips this row).
  { path: /^\/admin\/home-layout(\/|$)/, area: 'content' },

  // Events (the events service; BFF-only: pooja-api has no such area, the parity test skips these rows).
  { path: /^\/admin\/(events|event-types|event-badges)(\/|$)/, area: 'events' },

  // App releases, version policy, approvals and custom roles (engagement + identity; BFF-only, docs/RELEASES.md and docs/ROLES.md).
  { path: /^\/admin\/(releases|version-policy|versions)(\/|$)/, area: 'releases' },
  { path: /^\/admin\/approvals(\/|$)/, area: 'approvals' },
  // The Operators screen shows role names, so anyone who can view operators may READ the list (identity omits the permissions for them).
  { path: /^\/admin\/roles$/, area: 'roles', viewAlso: 'operators:view' },
  { path: /^\/admin\/roles(\/|$)/, area: 'roles' },
];

/** `{ area, level, also, viewAlso }` for a request (`viewAlso`: an alternative permission that is enough for a READ). Unmapped paths are `operators:<level>` (admin-only). */
export function areaFor(method, path) {
  const level = method === 'GET' || method === 'HEAD' ? 'view' : 'edit';
  const hit = ROUTE_AREAS.find((r) => r.path.test(path));
  return { area: hit ? hit.area : 'operators', level, mapped: !!hit, also: hit?.also, ...(hit?.viewAlso ? { viewAlso: hit.viewAlso } : {}) };
}
