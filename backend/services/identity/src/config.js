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
      default: ['mobile-bff', 'admin-bff', 'monolith', 'catalog', 'wallet', 'orders', 'calls'],
      parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
    },
    // Where the astrologer invite claim / lookup is asked. CALLS_URL set (phase 6) = the calls service, which owns astrologers; unset = the monolith
    // (`POST /internal/astrologers/claim`), exactly as before. Rollback of the calls service is unsetting CALLS_URL.
    callsUrl: { name: 'CALLS_URL', default: '', parse: serviceUrl },
    monolithUrl: { name: 'MONOLITH_URL', default: 'http://127.0.0.1:4000', parse: serviceUrl },
    serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
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
