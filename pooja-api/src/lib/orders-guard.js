import express from 'express';

import { config } from '../config/env.js';

/**
 * Phase 5 retirement helpers: with ORDERS_URL set the orders service owns pooja bookings, chadhava orders and pooja reviews, so these routes
 * answer as if they did not exist (404) and the BFFs serve them from there. Unset = served as ever.
 *
 * `unlessOrders(router)` wraps a whole router (a real Router, so the route-enumeration test in access/access.test.mjs still walks into it);
 * `routeUnlessOrders` is a per-route guard for modules that keep other routes (chadhava keeps the listings, poojas keep the definitions).
 */
export const ordersEnabled = () => Boolean(config.ordersUrl);

export function unlessOrders(router) {
  const guard = express.Router();
  guard.use((_req, _res, next) => (ordersEnabled() ? next('router') : next()));
  guard.use(router);
  return guard;
}

export const routeUnlessOrders = (_req, _res, next) => (ordersEnabled() ? next('route') : next());
