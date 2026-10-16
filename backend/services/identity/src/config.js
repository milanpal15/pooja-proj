import { loadEnv, serviceUrl } from '@bhakti/common';

/** The ONLY file in this service that reads process.env. `.env` is loaded by server.js (dotenv). */
export const loadConfig = (env = process.env) => ({
  ...loadEnv(env, {
    port: { name: 'PORT', default: 4040, parse: Number },
    mongodbUri: { name: 'MONGODB_URI', default: 'mongodb://127.0.0.1:27017' },
    dbName: { name: 'DB_NAME', default: 'identity' },
    secret: { name: 'INTERNAL_JWT_SECRET', required: true },
    allowedIssuers: {
      name: 'ALLOWED_ISSUERS',
      default: ['mobile-bff', 'admin-bff', 'monolith', 'catalog', 'wallet', 'orders', 'calls', 'engagement', 'events'],
      parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
    },
    // Where the astrologer invite claim / lookup is asked. CALLS_URL set (phase 6) = the calls service, which owns astrologers; unset = the monolith
    // (`POST /internal/astrologers/claim`), exactly as before. Rollback of the calls service is unsetting CALLS_URL.
    callsUrl: { name: 'CALLS_URL', default: '', parse: serviceUrl },
    monolithUrl: { name: 'MONOLITH_URL', default: 'http://127.0.0.1:4000', parse: serviceUrl },
    serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
    // The Users 360 view (docs/USERS.md): identity asks these services (read-only, by uid) for a devotee's devices, wallet, bookings, events and calls.
    // Each one UNSET = that section of the 360 answers { unavailable:true, reason:'not_configured' }; the rest still load. CALLS_URL is the one above.
    engagementUrl: { name: 'ENGAGEMENT_URL', default: '', parse: serviceUrl },
    walletUrl: { name: 'WALLET_URL', default: '', parse: serviceUrl },
    ordersUrl: { name: 'ORDERS_URL', default: '', parse: serviceUrl },
    eventsUrl: { name: 'EVENTS_URL', default: '', parse: serviceUrl },
    // How long one 360 section may take before it is shown as unavailable, ms.
    sectionTimeoutMs: { name: 'USER360_SECTION_TIMEOUT_MS', default: 1500, parse: Number },
    // How often (ms, 0 = off) a timed block that has run out is written back as an `auto_unblock` history row. The block stops applying the moment `until` passes either way.
    blockSweepEveryMs: { name: 'BLOCK_SWEEP_EVERY_MS', default: 60000, parse: Number },
    // Derives the devotee pseudonyms (`Devotee ••4821`) shown to a role without `devotees:view` (same value as the admin BFF / other services). Unset = random per boot.
    sessionSecret: { name: 'ADMIN_SESSION_SECRET', default: '' },
    adminUsername: { name: 'ADMIN_USERNAME', default: 'admin', parse: (v) => v.toLowerCase() },
    adminPassword: { name: 'ADMIN_PASSWORD', default: '' },
    firebaseServiceAccount: { name: 'FIREBASE_SERVICE_ACCOUNT', default: '' },
    firebaseServiceAccountPath: { name: 'FIREBASE_SERVICE_ACCOUNT_PATH', default: '' },
    googleApplicationCredentials: { name: 'GOOGLE_APPLICATION_CREDENTIALS', default: '' },
  }),
  isProduction: env.NODE_ENV === 'production',
  commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
});

export const config = () => loadConfig(process.env);
