import { loadEnv, serviceUrl } from '@bhakti/common';

const ms = (v) => Math.max(Number(v) || 0, 0);

/** The ONLY file in this service that reads process.env. `.env` is loaded by server.js (dotenv). */
export const loadConfig = (env = process.env) => {
  const c = {
    ...loadEnv(env, {
      port: { name: 'PORT', default: 4070, parse: Number },
      mongodbUri: { name: 'MONGODB_URI', default: 'mongodb://127.0.0.1:27017' },
      dbName: { name: 'DB_NAME', default: 'orders' },
      secret: { name: 'INTERNAL_JWT_SECRET', required: true },
      allowedIssuers: {
        name: 'ALLOWED_ISSUERS',
        default: ['mobile-bff', 'admin-bff', 'catalog'],
        parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
      },
      // The three services an order is made from. All required: an order without a price, a wallet or a name is not an order.
      walletUrl: { name: 'WALLET_URL', required: true, parse: serviceUrl },
      catalogUrl: { name: 'CATALOG_URL', required: true, parse: serviceUrl },
      identityUrl: { name: 'IDENTITY_URL', required: true, parse: serviceUrl },
      // Push tokens for the "your booking moved on" notification (best effort).
      engagementUrl: { name: 'ENGAGEMENT_URL', required: true, parse: serviceUrl },
      serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
      // The wallet call is a MONEY call: its timeout is what turns a lost answer into the sweeper's job. Same 5 s as the monolith's client.
      walletTimeoutMs: { name: 'WALLET_TIMEOUT_MS', default: 5000, parse: Number },
      expoPushUrl: { name: 'EXPO_PUSH_URL', default: 'https://exp.host/--/api/v2/push/send' },
      // Derives the devotee pseudonyms ("Devotee ••4821"). Same value as the admin BFF / wallet. Unset = random per boot.
      sessionSecret: { name: 'ADMIN_SESSION_SECRET', default: '' },
      // The saga sweeper: how often it runs (0 = off), how old a pending intent must be before it is looked at, and how long an
      // intent the wallet has never heard of waits before it is closed `expired`.
      sweepEveryMs: { name: 'SWEEP_EVERY_MS', default: 5000, parse: ms },
      intentMinAgeMs: { name: 'INTENT_MIN_AGE_MS', default: 10_000, parse: ms },
      intentGraceMs: { name: 'INTENT_GRACE_MS', default: 120_000, parse: ms },
      // Terminal intents (done / failed / expired / refunded) are deleted after this many days; pending ones never are.
      intentRetentionDays: { name: 'INTENT_RETENTION_DAYS', default: 30, parse: (v) => Math.max(Number(v) || 30, 1) },
      pruneEveryMs: { name: 'PRUNE_EVERY_MS', default: 3_600_000, parse: ms },
    }),
    isProduction: env.NODE_ENV === 'production',
    commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
  };
  if (c.secret.length < 16) throw new Error('INTERNAL_JWT_SECRET must be at least 16 characters.');
  return Object.freeze(c);
};

export const config = () => loadConfig(process.env);
