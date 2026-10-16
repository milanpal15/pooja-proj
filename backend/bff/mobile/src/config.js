import { loadEnv, serviceUrl } from '@bhakti/common';

/** The ONLY file in this project that reads process.env. `.env` is loaded by server.js (dotenv). */
const withChecks = (c) => {
  if ((c.engagementUrl || c.identityUrl || c.catalogUrl || c.walletUrl || c.ordersUrl || c.callsUrl || c.eventsUrl) && c.internalJwtSecret.length < 16) {
    throw new Error('ENGAGEMENT_URL / IDENTITY_URL / CATALOG_URL / WALLET_URL / ORDERS_URL / CALLS_URL / EVENTS_URL is set, so INTERNAL_JWT_SECRET (at least 16 characters) is required.');
  }
  // GET /api/content is assembled here from the catalog bundle + engagement's settings and announcement.
  if (c.catalogUrl && !c.engagementUrl) throw new Error('CATALOG_URL is set, so ENGAGEMENT_URL is required too (settings and the announcement come from it).');
  // Saying Jai on a live stream needs a verified devotee, which only this BFF's identity edge provides.
  if (c.catalogUrl && !c.identityUrl) throw new Error('CATALOG_URL is set, so IDENTITY_URL is required too (live darshan\'s Jai needs the BFF to authenticate the devotee).');
  // The devotee wallet routes (balance, buying coins) need a verified uid, which only this BFF's identity edge provides.
  if (c.walletUrl && !c.identityUrl) throw new Error('WALLET_URL is set, so IDENTITY_URL is required too (the wallet routes need the BFF to authenticate the devotee).');
  // The devotee booking / chadhava routes need a verified uid, which only this BFF's identity edge provides.
  if (c.ordersUrl && !c.identityUrl) throw new Error('ORDERS_URL is set, so IDENTITY_URL is required too (the booking and chadhava routes need the BFF to authenticate the devotee).');
  // The devotee call / astrologer routes need a verified uid, which only this BFF's identity edge provides.
  if (c.callsUrl && !c.identityUrl) throw new Error('CALLS_URL is set, so IDENTITY_URL is required too (the call and astrologer routes need the BFF to authenticate the devotee).');
  return Object.freeze(c);
};

export const loadConfig = (env = process.env) => withChecks({
  ...loadEnv(env, {
    port: { name: 'PORT', default: 4010, parse: Number },
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
    // Phase 4: when set, the wallet routes (balance, ledger, buying coins, coin packs, the Razorpay webhook) are served from the wallet
    // service and the monolith retires them. UNSET = the monolith serves all of it.
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
    // Verifying a Firebase ID token needs only the project id; a service-account key (same lookup order as pooja-api) also gives it.
    firebaseProjectId: { name: 'FIREBASE_PROJECT_ID', default: '' },
    firebaseServiceAccount: { name: 'FIREBASE_SERVICE_ACCOUNT', default: '' },
    firebaseServiceAccountPath: { name: 'FIREBASE_SERVICE_ACCOUNT_PATH', default: '' },
    googleApplicationCredentials: { name: 'GOOGLE_APPLICATION_CREDENTIALS', default: '' },
  }),
  isProduction: env.NODE_ENV === 'production',
  commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
});

export const config = loadConfig(process.env);
