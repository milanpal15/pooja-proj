import { randomBytes } from 'node:crypto';

import { rejectFcmRegistration, createCallsMount, createCatalogMount, createEngagementMount, createGatewayApp, createIdentityAdminMount, createLogger, createOrdersMount, createWalletMount } from '@bhakti/common';

/**
 * Dashboard gateway. Everything is streamed to the monolith, except:
 *   - ENGAGEMENT_URL set (phase 1): the routes the engagement service owns (packages/common/src/engagement-mount.js);
 *   - IDENTITY_URL set (phase 2): THIS BFF owns the operator session (cookie, login throttle, role/area gate), serves the
 *     routes identity owns (devotees, operators, audit log, policies), audits every operator write, and forwards the rest to the
 *     monolith with a signed service token instead of the cookie (packages/common/src/identity-mount.js).
 *   - CATALOG_URL set (phase 3): the catalog-owned operator routes sit behind the same area gate, `GET /api/content` and the app's
 *     read routes are served from it, and `/uploads` is streamed from it (packages/common/src/catalog-mount.js).
 *   - WALLET_URL set (phase 4): the wallet-owned operator routes (wallet search/ledger/adjust, coin packs/orders/stats, billing rules) sit behind the same
 *     area gate and audit; `GET /api/coins/packs` and the Razorpay webhook are served from it too (packages/common/src/wallet-mount.js).
 *   - ORDERS_URL set (phase 5): the operator bookings / reviews / chadhava-orders screens (list + status change / hide) sit behind the same area gate and audit,
 *     and the public review list is served from it (packages/common/src/orders-mount.js).
 *   - CALLS_URL set (phase 6): the operator astrologers / calls / payouts screens (CRUD, suspend, force end, goodwill refund, record a payout) sit behind the same area
 *     gate and audit, and the public astrologer list is served from it (packages/common/src/calls-mount.js).
 * Explicit lists, fail-closed: a path that is neither public nor allowed by the area gate is refused here.
 */
export function createApp(config, { logger = createLogger('admin-bff'), fetchImpl, now } = {}) {
  let identity = null;
  if (config.identityUrl) {
    let sessionSecret = config.sessionSecret;
    if (!sessionSecret || sessionSecret.length < 16) {
      sessionSecret = randomBytes(32).toString('hex');
      logger.warn('ADMIN_SESSION_SECRET is not set (or shorter than 16 characters): using a random key, so every operator is signed out on restart. Set it in any real deployment.');
    }
    identity = createIdentityAdminMount({ ...config, sessionSecret }, { logger, fetchImpl, now });
  }
  const engagement = createEngagementMount('admin-bff', config, {
    logger,
    fetchImpl,
    ...(identity ? { operator: { sessions: identity.sessions, audit: identity.audit } } : {}),
  });
  const catalog = createCatalogMount('admin-bff', config, {
    logger,
    fetchImpl,
    ...(identity ? { operator: { sessions: identity.sessions, audit: identity.audit } } : {}),
  });
  const wallet = createWalletMount('admin-bff', config, {
    logger,
    fetchImpl,
    ...(identity ? { operator: { sessions: identity.sessions, audit: identity.audit } } : {}),
  });
  const orders = createOrdersMount('admin-bff', config, {
    logger,
    fetchImpl,
    ...(identity ? { operator: { sessions: identity.sessions, audit: identity.audit } } : {}),
  });
  const calls = createCallsMount('admin-bff', config, {
    logger,
    fetchImpl,
    ...(identity ? { operator: { sessions: identity.sessions, audit: identity.audit } } : {}),
  });
  const mounts = [engagement, identity, catalog, wallet, orders, calls].filter(Boolean);
  return createGatewayApp('admin-bff', config, {
    logger,
    softDeps: Object.assign({}, ...mounts.map((m) => m.softDeps)),
    mount: mounts.length
      ? (app) => {
          app.all('/api/push/register', rejectFcmRegistration()); // the phone's FCM registration is the mobile BFF's; only the old anonymous Expo POST passes
          engagement?.mount(app);
          catalog?.mount(app); // content, Home, live, poojas ... behind the area gate (before the identity gate and the monolith proxy)
          wallet?.mount(app); // wallet, coin packs, billing rules ... behind the area gate
          orders?.mount(app); // bookings, reviews, chadhava orders ... behind the area gate; the public review list
          calls?.mount(app); // astrologers, calls, payouts ... behind the area gate; the public astrologer list
          if (identity) {
            identity.mount(app); // /api/admin/login|logout|session
            identity.mountIdentityRoutes(app);
            identity.mountGate(app); // everything else: session + area gate, then the monolith
          }
        }
      : undefined,
    proxyHeaders: identity?.proxyHeaders,
  });
}
