/**
 * The routes the CALLS service owns that the BFFs serve (phase 6).
 *
 * Calls' internal paths mirror the monolith's `/api` paths exactly (`/api/admin/astrologers/5/suspend` -> `/internal/calls/admin/astrologers/5/suspend`), so
 * `to === path`. A path that is NOT in these tables is not calls': it falls through to the monolith (which answers 404 for these paths once CALLS_URL is set).
 *
 *   CALLS_ADMIN_ROUTES    operator routes the admin BFF hands to calls AFTER the area gate (access/routes.js: `astrologers`, `calls`, `payouts`). Calls
 *                         re-checks the permission from the signed token. `successStatus` is what the monolith answered on success when it is not 200.
 *   CALLS_DEVOTEE_ROUTES  the devotee / astrologer routes the MOBILE BFF serves (its device auth edge supplies the uid as the signed `sub`, and the profile
 *                         name as `ctx.name`). `money: true` = the route makes calls call the wallet (5 s) - it gets the longer timeout. `status` is what
 *                         the monolith answered on success. The astrologer-only ones are re-checked in calls against ITS astrologers (never a claim).
 *   CALLS_PUBLIC_GETS     the public astrologer list / profile both BFFs serve.
 */
const ID = '000000000000000000000001';

export const CALLS_ADMIN_ROUTES = [
  { method: 'GET', path: '/admin/astrologers', to: '/admin/astrologers', area: 'astrologers' },
  { method: 'POST', path: '/admin/astrologers', to: '/admin/astrologers', area: 'astrologers', successStatus: 201 },
  { method: 'PUT', path: '/admin/astrologers/:id', to: '/admin/astrologers/:id', area: 'astrologers', sample: `/admin/astrologers/${ID}` },
  { method: 'DELETE', path: '/admin/astrologers/:id', to: '/admin/astrologers/:id', area: 'astrologers', sample: `/admin/astrologers/${ID}` },
  { method: 'POST', path: '/admin/astrologers/:id/suspend', to: '/admin/astrologers/:id/suspend', area: 'astrologers', sample: `/admin/astrologers/${ID}/suspend` },
  { method: 'POST', path: '/admin/astrologers/:id/reactivate', to: '/admin/astrologers/:id/reactivate', area: 'astrologers', sample: `/admin/astrologers/${ID}/reactivate` },

  { method: 'GET', path: '/admin/calls', to: '/admin/calls', area: 'calls' },
  { method: 'POST', path: '/admin/calls/:id/end', to: '/admin/calls/:id/end', area: 'calls', sample: `/admin/calls/${ID}/end` },
  { method: 'POST', path: '/admin/calls/:id/refund', to: '/admin/calls/:id/refund', area: 'calls', sample: `/admin/calls/${ID}/refund` },

  { method: 'GET', path: '/admin/payouts/summary', to: '/admin/payouts/summary', area: 'payouts' },
  { method: 'GET', path: '/admin/payouts', to: '/admin/payouts', area: 'payouts' },
  { method: 'POST', path: '/admin/payouts', to: '/admin/payouts', area: 'payouts', successStatus: 201 },
];

export const CALLS_DEVOTEE_ROUTES = [
  { method: 'GET', path: '/astrologer/me' },
  { method: 'PUT', path: '/astrologer/me/presence' },
  { method: 'POST', path: '/astrologer/me/heartbeat' },
  { method: 'GET', path: '/astrologer/me/incoming' },
  { method: 'GET', path: '/astrologer/me/calls' },
  { method: 'GET', path: '/astrologer/me/earnings' },

  { method: 'POST', path: '/calls', money: true },
  { method: 'GET', path: '/calls/:id', sample: `/calls/${ID}` },
  { method: 'POST', path: '/calls/:id/cancel', sample: `/calls/${ID}/cancel` },
  { method: 'POST', path: '/calls/:id/end', sample: `/calls/${ID}/end` },
  { method: 'POST', path: '/calls/:id/accept', sample: `/calls/${ID}/accept`, money: true },
  { method: 'POST', path: '/calls/:id/decline', sample: `/calls/${ID}/decline` },
  { method: 'POST', path: '/calls/:id/rating', sample: `/calls/${ID}/rating` },
];

/** The astrologer list / profile are public in the monolith; no stale copy is kept: presence is soft state, and an old "online" is a lie. */
export const CALLS_PUBLIC_GETS = [{ path: '/astrologers' }, { path: '/astrologers/:id', sample: `/astrologers/${ID}` }];
