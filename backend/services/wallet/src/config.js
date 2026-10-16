import { loadEnv, serviceUrl } from '@bhakti/common';


/** The ONLY file in this service that reads process.env. `.env` is loaded by server.js (dotenv). */
export const loadConfig = (env = process.env) => {
  const c = {
    ...loadEnv(env, {
      port: { name: 'PORT', default: 4060, parse: Number },
      mongodbUri: { name: 'MONGODB_URI', default: 'mongodb://127.0.0.1:27017' },
      dbName: { name: 'DB_NAME', default: 'wallet' },
      secret: { name: 'INTERNAL_JWT_SECRET', required: true },
      allowedIssuers: {
        name: 'ALLOWED_ISSUERS',
        default: ['mobile-bff', 'admin-bff', 'monolith', 'pooja-api', 'orders', 'calls', 'events'],
        parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
      },
      // The settings table (coin rate, billing rules) is engagement's. Required: pack validation reads the coin rate STRICTLY.
      engagementUrl: { name: 'ENGAGEMENT_URL', required: true, parse: serviceUrl },
      // Names behind the admin wallet search / `who` column.
      identityUrl: { name: 'IDENTITY_URL', required: true, parse: serviceUrl },
      serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
      // Derives the devotee pseudonyms (same value as the admin BFF / monolith). Unset = random per boot.
      sessionSecret: { name: 'ADMIN_SESSION_SECRET', default: '' },
      reconcileEveryMs: { name: 'RECONCILE_EVERY_MS', default: 15_000, parse: (v) => Math.max(Number(v) || 0, 0) },
    }),
    isProduction: env.NODE_ENV === 'production',
    commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
    /** Payments. Trimmed: a stray space or newline pasted into a host's dashboard breaks auth invisibly. */
    payments: Object.freeze({
      nodeEnv: env.NODE_ENV,
      provider: (env.PAYMENTS_PROVIDER || '').trim(),
      keyId: (env.RAZORPAY_KEY_ID || '').trim(),
      keySecret: (env.RAZORPAY_KEY_SECRET || '').trim(),
      webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
    }),
  };
  if (c.secret.length < 16) throw new Error('INTERNAL_JWT_SECRET must be at least 16 characters.');
  return Object.freeze(c);
};

export const config = () => loadConfig(process.env);
