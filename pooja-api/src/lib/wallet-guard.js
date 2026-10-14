import express from 'express';

import { walletEnabled } from './wallet-client.js';

/**
 * Phase 4 retirement helper: with WALLET_URL set the wallet service owns wallets, the coin ledger, coin packs, purchases, the Razorpay
 * webhook and the billing rules, so these routes answer as if they did not exist (404) and the BFFs serve them. Unset = served as ever.
 *
 * A real Router (not a bare function) so the route-enumeration test (access/access.test.mjs) still walks into it.
 */
export function unlessWallet(router) {
  const guard = express.Router();
  guard.use((_req, _res, next) => (walletEnabled() ? next('router') : next()));
  guard.use(router);
  return guard;
}
