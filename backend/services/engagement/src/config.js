import { loadEnv, serviceUrl } from '@bhakti/common';

/** The ONLY file in this service that reads process.env. `.env` is loaded by server.js (dotenv). */
export const loadConfig = (env = process.env) => ({
  ...loadEnv(env, {
    port: { name: 'PORT', default: 4030, parse: Number },
    mongodbUri: { name: 'MONGODB_URI', default: 'mongodb://127.0.0.1:27017' },
    dbName: { name: 'DB_NAME', default: 'engagement' },
    secret: { name: 'INTERNAL_JWT_SECRET', required: true },
    allowedIssuers: {
      name: 'ALLOWED_ISSUERS',
      default: ['mobile-bff', 'admin-bff', 'monolith', 'catalog', 'wallet', 'orders', 'calls', 'identity'],
      parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
    },
    expoPushUrl: { name: 'EXPO_PUSH_URL', default: 'https://exp.host/--/api/v2/push/send' },
    // Identity: asked how many active operators hold `approvals:edit` (a risky version change needs a second approver). Unset = a lone stack: the requester is the only approver.
    identityUrl: { name: 'IDENTITY_URL', default: '', parse: serviceUrl },
    serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
    // How often (ms, 0 = off) pending approval requests past their 24 h expiry are marked `expired`.
    approvalSweepEveryMs: { name: 'APPROVAL_SWEEP_EVERY_MS', default: 60000, parse: Number },
  }),
  isProduction: env.NODE_ENV === 'production',
  commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
});

export const config = () => loadConfig(process.env);
