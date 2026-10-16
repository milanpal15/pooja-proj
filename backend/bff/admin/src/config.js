import { loadEnv, serviceUrl } from '@bhakti/common';

/** The ONLY file in this project that reads process.env. `.env` is loaded by server.js (dotenv). */
const withChecks = (c) => {
  if ((c.engagementUrl || c.identityUrl || c.catalogUrl || c.walletUrl || c.ordersUrl || c.callsUrl || c.eventsUrl) && c.internalJwtSecret.length < 16) {
    throw new Error('ENGAGEMENT_URL / IDENTITY_URL / CATALOG_URL / WALLET_URL / ORDERS_URL / CALLS_URL / EVENTS_URL is set, so INTERNAL_JWT_SECRET (at least 16 characters) is required.');
  }
  // GET /api/content is assembled here from the catalog bundle + engagement's settings and announcement.
  if (c.catalogUrl && !c.engagementUrl) throw new Error('CATALOG_URL is set, so ENGAGEMENT_URL is required too (settings and the announcement come from it).');
  return Object.freeze(c);
};

export const loadConfig = (env = process.env) => withChecks({
  ...loadEnv(env, {
    port: { name: 'PORT', default: 4020, parse: Number },
    monolithUrl: { name: 'MONOLITH_URL', default: 'http://127.0.0.1:4000', parse: serviceUrl },
    corsOrigin: { name: 'CORS_ORIGIN', default: '*' },
    proxyTimeoutMs: { name: 'PROXY_TIMEOUT_MS', default: 30000, parse: Number },
    // Phase 1: when set, flags / announcements / analytics ingest / settings are served by the engagement service.
    // UNSET = a pure gateway to the monolith, exactly as in phase 0.
    engagementUrl: { name: 'ENGAGEMENT_URL', default: '', parse: serviceUrl },
    internalJwtSecret: { name: 'INTERNAL_JWT_SECRET', default: '' },
    serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
    // Phase 2: when set, this BFF authenticates users itself and the monolith trusts its signed token (see docs/MICROSERVICES.md).
    // UNSET = phase 1 behaviour (the monolith still authenticates).
    identityUrl: { name: 'IDENTITY_URL', default: '', parse: serviceUrl },
    // Phase 3: when set, content / Home / live / poojas / chadhava listings / panchang / horoscope / media come from the catalog service
    // and GET /api/content is assembled here. UNSET = the monolith serves all of it (needs ENGAGEMENT_URL when set).
    catalogUrl: { name: 'CATALOG_URL', default: '', parse: serviceUrl },
    // Phase 4: when set, the operator wallet / coin-pack / billing-rule routes and the Razorpay webhook are served from the wallet service.
    // UNSET = the monolith serves all of it.
    walletUrl: { name: 'WALLET_URL', default: '', parse: serviceUrl },
    // Phase 5: when set, pooja bookings, chadhava orders and pooja reviews (devotee routes, the public review list, the dashboard's bookings / reviews /
    // chadhava-orders screens) are served from the orders service. UNSET = the monolith serves all of it.
    ordersUrl: { name: 'ORDERS_URL', default: '', parse: serviceUrl },
    // How long a PURCHASE (a booking, a chadhava order, a cancel) may take end to end: orders calls catalog and the wallet (5 s each) inside it.
    ordersTimeoutMs: { name: 'ORDERS_TIMEOUT_MS', default: 15000, parse: Number },
    // Phase 6: when set, astrologers, calls and payouts (the devotee / astrologer routes, the public astrologer list, the dashboard's astrologers / calls /
    // payouts screens) are served from the calls service. UNSET = the monolith serves all of it.
    callsUrl: { name: 'CALLS_URL', default: '', parse: serviceUrl },
    // How long placing / answering a call may take end to end: calls asks the settings and the wallet (5 s each) inside it.
    callsTimeoutMs: { name: 'CALLS_TIMEOUT_MS', default: 15000, parse: Number },
    // Events: when set, `GET /api/events[/:slug]` (mobile) / the operator events, event-types and event-badges screens (admin) are served from the events service.
    // UNSET = those paths fall through to the monolith (which has no events). Needs nothing else: a guest can read the list.
    eventsUrl: { name: 'EVENTS_URL', default: '', parse: serviceUrl },
    // The operator session cookie is signed and verified HERE once IDENTITY_URL is set. Without a secret a random one is made per
    // boot (everyone is signed out on restart); set it in any real deployment (>= 16 chars). SESSION_SAMESITE: Strict | Lax | None.
    sessionSecret: { name: 'ADMIN_SESSION_SECRET', default: '' },
    sessionSameSite: { name: 'SESSION_SAMESITE', default: 'Strict' },
    // Which deployment this is, shown as the dashboard's environment badge (returned by GET /api/admin/session): local | tester | production.
    // tools/stack.sh leaves it `local`, tools/tester.sh sets `tester`, render.yaml sets `production`. Anything else is read as `local`.
    appEnv: { name: 'APP_ENV', default: 'local', parse: (v) => (['local', 'tester', 'production'].includes(String(v).trim().toLowerCase()) ? String(v).trim().toLowerCase() : 'local') },
  }),
  isProduction: env.NODE_ENV === 'production',
  commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
});

export const config = loadConfig(process.env);
