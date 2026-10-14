import express from 'express';

import { config } from '../config/env.js';

/**
 * Phase 6 retirement helper: with CALLS_URL set the calls service owns astrologers, calls and payouts (the devotee and astrologer routes, the public
 * astrologer list, the dashboard's astrologers / calls / payouts screens, identity's claim endpoints, the billing ticker), so these routes answer as
 * if they did not exist (404) and the BFFs serve them. Unset = served as ever.
 *
 * `unlessCalls(router)` wraps a whole router (a real Router, so the route-enumeration test in access/access.test.mjs still walks into it).
 */
export const callsEnabled = () => Boolean(config.callsUrl);

export function unlessCalls(router) {
  const guard = express.Router();
  guard.use((_req, _res, next) => (callsEnabled() ? next('router') : next()));
  guard.use(router);
  return guard;
}
