import { createCallsMount, createCatalogMount, createEngagementMount, createGatewayApp, createIdentityMobileMount, createLogger, createOrdersMount, createWalletMount } from '@bhakti/common';

import { createFirebaseVerifier } from './firebase.js';

/**
 * Phone-app gateway. Everything is streamed to the monolith, except:
 *   - ENGAGEMENT_URL set (phase 1): the routes the engagement service owns (packages/common/src/engagement-mount.js);
 *   - IDENTITY_URL set (phase 2): THIS BFF is the device auth edge - it verifies the Firebase token, checks `blocked` with
 *     identity (failing closed), serves /api/auth/* and the policy routes from identity, and forwards the rest to the
 *     monolith with a signed service token instead of the Firebase token (packages/common/src/identity-mount.js).
 *     The operator routes then leave this BFF: operators sign in through the admin BFF only.
 *   - CATALOG_URL set (phase 3): content / Home / live / poojas / chadhava listings / panchang / horoscope / media come from the catalog
 *     service, `GET /api/content` is assembled HERE, and `/uploads` is streamed from it (packages/common/src/catalog-mount.js).
 *   - WALLET_URL set (phase 4): the devotee wallet routes (balance, transactions, buying coins), `GET /api/coins/packs` and the Razorpay webhook (streamed byte
 *     for byte) are served from the wallet service (packages/common/src/wallet-mount.js); a wallet that is down is 503 `wallet_unavailable`, never success.
 *   - ORDERS_URL set (phase 5): the devotee booking and chadhava-order routes (create / list / get / cancel / review), the retired `POST /api/chadhava` (410) and the public
 *     `GET /api/poojas/:slug/reviews` are served from the orders service (packages/common/src/orders-mount.js); orders unreachable is 503 `orders_unavailable`.
 *   - CALLS_URL set (phase 6): the astrologer list / profile, the devotee call routes (request, poll, cancel, end, accept, decline, rate) and the astrologer's own
 *     `/api/astrologer/me/*` are served from the calls service (packages/common/src/calls-mount.js); calls unreachable is 503 `calls_unavailable`.
 * Explicit lists, fail-closed: anything else still goes to the monolith, whose own gate decides.
 */
export function createApp(config, { logger = createLogger('mobile-bff'), fetchImpl, verifyIdToken, firebase, now } = {}) {
  let identity = null;
  if (config.identityUrl) {
    const v = verifyIdToken ? { verifyIdToken, firebase } : createFirebaseVerifier(config, logger);
    identity = createIdentityMobileMount(config, { logger, fetchImpl, verifyIdToken: v.verifyIdToken, firebase: v.firebase, ...(now ? { now } : {}) });
  }
  const engagement = createEngagementMount('mobile-bff', config, { logger, fetchImpl, ...(identity ? { operator: false } : {}) });
  // After identity: the Jai route reads `req.deviceAuth`, which the identity edge's `/api` middleware sets.
  const catalog = createCatalogMount('mobile-bff', config, { logger, fetchImpl, operator: false, devotee: identity?.devotee ?? null, ...(now ? { now } : {}) });
  // After identity: the devotee routes read `req.deviceAuth`, which the identity edge's `/api` middleware sets.
  const wallet = createWalletMount('mobile-bff', config, { logger, fetchImpl, operator: false, devotee: identity?.devotee ?? null, ...(now ? { now } : {}) });
  // After identity: the devotee routes read `req.deviceAuth`, which the identity edge's `/api` middleware sets.
  const orders = createOrdersMount('mobile-bff', config, { logger, fetchImpl, operator: false, devotee: identity?.devotee ?? null, ...(now ? { now } : {}) });
  // After identity: the devotee routes read `req.deviceAuth`, which the identity edge's `/api` middleware sets.
  const calls = createCallsMount('mobile-bff', config, { logger, fetchImpl, operator: false, devotee: identity?.devotee ?? null });
  const mounts = [engagement, identity, catalog, wallet, orders, calls].filter(Boolean);
  return createGatewayApp('mobile-bff', config, {
    logger,
    softDeps: Object.assign({}, ...mounts.map((m) => m.softDeps)),
    mount: mounts.length ? (app) => mounts.forEach((m) => m.mount(app)) : undefined,
    proxyHeaders: identity?.proxyHeaders,
  });
}
