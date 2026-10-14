import express from 'express';

import { catalogEnabled } from './catalog-client.js';

/**
 * Phase 3 retirement helpers: with CATALOG_URL set the catalog service owns the data these routes serve, so they answer
 * as if they did not exist (404) and the BFFs serve them. Unset = served as ever.
 *
 * `unlessCatalog(router)` wraps a whole router. It is a real Router (not a bare function) so the route-enumeration test
 * (access/access.test.mjs) still walks into it. `routeUnlessCatalog` is a per-route guard for the modules that keep part
 * of their surface (poojas keep `/poojas/:slug/reviews`; chadhava keeps the order routes) until phase 5.
 */
export function unlessCatalog(router) {
  const guard = express.Router();
  guard.use((_req, _res, next) => (catalogEnabled() ? next('router') : next()));
  guard.use(router);
  return guard;
}

export const routeUnlessCatalog = (_req, _res, next) => (catalogEnabled() ? next('route') : next());
