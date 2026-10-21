import { loadEnv, serviceUrl } from '@bhakti/common';


/** The ONLY file in this service that reads process.env. `.env` is loaded by server.js (dotenv). */
export const loadConfig = (env = process.env) => {
  const c = {
    ...loadEnv(env, {
      port: { name: 'PORT', default: 4050, parse: Number },
      mongodbUri: { name: 'MONGODB_URI', default: 'mongodb://127.0.0.1:27017' },
      dbName: { name: 'DB_NAME', default: 'catalog' },
      secret: { name: 'INTERNAL_JWT_SECRET', required: true },
      allowedIssuers: {
        name: 'ALLOWED_ISSUERS',
        default: ['mobile-bff', 'admin-bff', 'monolith', 'pooja-api', 'wallet', 'orders', 'calls', 'identity', 'events'],
        parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
      },
      // Settings (prasad fee, chadhava fee/minimum) are engagement's. Required: import-sevas and the chadhava catalogue read them.
      engagementUrl: { name: 'ENGAGEMENT_URL', required: true, parse: serviceUrl },
      // The orders side answers GET /internal/orders/pooja-stats: the orders service (phase 5), or the monolith while its ORDERS_URL is unset. Unset = no booking counts / ratings.
      ordersUrl: { name: 'ORDERS_URL', default: '', parse: serviceUrl },
      serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
      maxUploadMb: { name: 'MAX_UPLOAD_MB', default: 25, parse: (v) => Number(v) || 25 },
      // Optional: files that still sit on a disk from before media moved into GridFS keep being served.
      uploadDir: { name: 'UPLOAD_DIR', default: '' },
      youtubeApiKey: { name: 'YOUTUBE_API_KEY', default: '', parse: (v) => v.trim() },
      // The 60 s live-stream probe. Off in tests; `0` turns it off in a deployment that has no outbound access.
      probeEnabled: { name: 'LIVE_PROBE', default: true, parse: (v) => !['0', 'false', 'off'].includes(v.trim().toLowerCase()) },
      // Nearby temples map (docs/TEMPLE_MAP.md): the public Overpass instances, tried in order.
      overpassUrls: {
        name: 'OVERPASS_URLS',
        default: ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],
        parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
      },
      placesCacheDays: { name: 'PLACES_CACHE_DAYS', default: 7, parse: (v) => Number(v) > 0 ? Number(v) : 7 },
      placesStaleDays: { name: 'PLACES_STALE_DAYS', default: 30, parse: (v) => Number(v) > 0 ? Number(v) : 30 },
      placesUserAgent: { name: 'PLACES_USER_AGENT', default: 'BhaktiApp/1.0 (temples map)', parse: (v) => v.trim() || 'BhaktiApp/1.0 (temples map)' },
      placesTimeoutMs: { name: 'PLACES_TIMEOUT_MS', default: 20000, parse: (v) => Number(v) > 0 ? Number(v) : 20000 },
      placesTotalMs: { name: 'PLACES_TOTAL_MS', default: 25000, parse: (v) => Number(v) > 0 ? Number(v) : 25000 },
      placesBreakerMs: { name: 'PLACES_BREAKER_MS', default: 60000, parse: (v) => Number(v) > 0 ? Number(v) : 60000 },
      placesUpstreamPerSec: { name: 'PLACES_UPSTREAM_PER_SEC', default: 2, parse: (v) => Number(v) > 0 ? Number(v) : 2 },
      placesRatePerMin: { name: 'PLACES_RATE_PER_MIN', default: 30, parse: (v) => Number(v) > 0 ? Number(v) : 30 },
    }),
    isProduction: env.NODE_ENV === 'production',
    commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
  };
  if (c.secret.length < 16) throw new Error('INTERNAL_JWT_SECRET must be at least 16 characters.');
  return Object.freeze(c);
};

export const config = () => loadConfig(process.env);
