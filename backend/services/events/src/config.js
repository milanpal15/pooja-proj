import { loadEnv, serviceUrl } from '@bhakti/common';

/** The ONLY file in this service that reads process.env. `.env` is loaded by server.js (dotenv). */
export const loadConfig = (env = process.env) => {
  const c = {
    ...loadEnv(env, {
      port: { name: 'PORT', default: 4090, parse: Number },
      mongodbUri: { name: 'MONGODB_URI', default: 'mongodb://127.0.0.1:27017' },
      dbName: { name: 'DB_NAME', default: 'events' },
      secret: { name: 'INTERNAL_JWT_SECRET', required: true },
      allowedIssuers: {
        name: 'ALLOWED_ISSUERS',
        default: ['mobile-bff', 'admin-bff', 'catalog', 'orders', 'identity', 'wallet'],
        parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
      },
      // Referenced streams / listings / poojas / temples / aartis are looked up here. Unset = publishing answers 503 (fail closed).
      catalogUrl: { name: 'CATALOG_URL', default: '', parse: serviceUrl },
      serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
      // Coin rewards are credited by the wallet (type bonus, keys `event-...`). Unset = rewards stay pending and are retried by the sweeper.
      walletUrl: { name: 'WALLET_URL', default: '', parse: serviceUrl },
      // Names / phones in the operator participants list (only for roles that may see them). Unset = pseudonyms for everyone.
      identityUrl: { name: 'IDENTITY_URL', default: '', parse: serviceUrl },
      // Derives the devotee pseudonyms (same value as the admin BFF and the other services). Unset = random per boot.
      sessionSecret: { name: 'ADMIN_SESSION_SECRET', default: '' },
      // The reward / badge retry sweeper. 0 disables it.
      sweepEveryMs: { name: 'SWEEP_EVERY_MS', default: 15_000, parse: (v) => Math.max(Number(v) || 0, 0) },
    }),
    isProduction: env.NODE_ENV === 'production',
    commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
  };
  if (c.secret.length < 16) throw new Error('INTERNAL_JWT_SECRET must be at least 16 characters.');
  return Object.freeze(c);
};

export const config = () => loadConfig(process.env);
