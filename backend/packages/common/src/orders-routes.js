/**
 * The routes the ORDERS service owns that the BFFs serve (phase 5).
 *
 * Orders' internal paths mirror the monolith's `/api` paths exactly (`/api/admin/bookings/5/status` -> `/internal/orders/admin/bookings/5/status`),
 * so `to === path`. A path that is NOT in these tables is not orders': it falls through to the monolith (which answers 404 for these paths once
 * ORDERS_URL is set).
 *
 *   ORDERS_ADMIN_ROUTES    operator routes the admin BFF hands to orders AFTER the area gate (access/routes.js: bookings, reviews and chadhava
 *                          orders are area `orders` - everyone with the dashboard reads, a status change or a review hide needs `orders:edit`).
 *                          Orders re-checks the permission from the signed token.
 *   ORDERS_DEVOTEE_ROUTES  the devotee routes the MOBILE BFF serves (its device auth edge supplies the uid as the signed `sub`, and the profile
 *                          name as `ctx.name`). `status` is what the monolith answered on success (a booking / an order answers 201 when it was
 *                          created and 200 when a retry found it - orders decides, the BFF relays).
 *   ORDERS_PUBLIC_GETS     the public review list both BFFs serve; `maxStaleMs` is how long a last good answer may be served if orders is down.
 *   ORDERS_GONE            `POST /api/chadhava`: the retired free-amount chadhava, a static 410 the mobile BFF relays from orders.
 */
const ID = '000000000000000000000001';

export const ORDERS_ADMIN_ROUTES = [
  { method: 'GET', path: '/admin/bookings', to: '/admin/bookings', area: 'orders' },
  { method: 'PUT', path: '/admin/bookings/:id/status', to: '/admin/bookings/:id/status', area: 'orders', sample: `/admin/bookings/${ID}/status` },
  { method: 'GET', path: '/admin/reviews', to: '/admin/reviews', area: 'orders' },
  { method: 'PUT', path: '/admin/reviews/:id', to: '/admin/reviews/:id', area: 'orders', sample: `/admin/reviews/${ID}` },
  { method: 'GET', path: '/admin/chadhava-orders', to: '/admin/chadhava-orders', area: 'orders' },
  { method: 'PUT', path: '/admin/chadhava-orders/:id/status', to: '/admin/chadhava-orders/:id/status', area: 'orders', sample: `/admin/chadhava-orders/${ID}/status` },
];

export const ORDERS_DEVOTEE_ROUTES = [
  { method: 'GET', path: '/bookings' },
  { method: 'GET', path: '/bookings/:id', sample: `/bookings/${ID}` },
  { method: 'POST', path: '/bookings', purchase: true },
  { method: 'POST', path: '/bookings/:id/cancel', sample: `/bookings/${ID}/cancel`, purchase: true },
  { method: 'POST', path: '/bookings/:id/review', sample: `/bookings/${ID}/review` },
  { method: 'POST', path: '/chadhava/orders', purchase: true },
  { method: 'GET', path: '/chadhava/orders' },
  { method: 'POST', path: '/chadhava/orders/:id/cancel', sample: `/chadhava/orders/${ID}/cancel`, purchase: true },
];

const HOUR = 3_600_000;
export const ORDERS_PUBLIC_GETS = [{ path: '/poojas/:slug/reviews', maxStaleMs: HOUR }];

export const ORDERS_GONE = { method: 'POST', path: '/chadhava' };
