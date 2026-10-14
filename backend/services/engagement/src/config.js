import { loadEnv } from '@bhakti/common';

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
  }),
  isProduction: env.NODE_ENV === 'production',
  commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
});

export const config = () => loadConfig(process.env);
