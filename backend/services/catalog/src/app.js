import express from 'express';
import { accessLog, createLogger, errorHandler, health, requestId, requireServiceAuth } from '@bhakti/common';

import { setContext } from './lib/context.js';
import { createSettingsReader } from './lib/engagement.js';
import { HttpError } from './lib/http-error.js';
import { createOrdersStats } from './lib/orders-stats.js';
import { callerGate, operatorGate, requireDevotee } from './lib/perms.js';
import * as chadhava from './modules/chadhava/index.js';
import { content } from './modules/content/index.js';
import { publicContentRoutes } from './modules/content/content.public.js';
import { horoscope } from './modules/horoscope/index.js';
import * as home from './modules/home/index.js';
import * as live from './modules/live/index.js';
import { mediaRoutes, uploadRoutes } from './modules/media/index.js';
import { panchang } from './modules/panchang/index.js';
import { pricingRoutes } from './modules/pricing/pricing.routes.js';
import * as poojas from './modules/poojas/index.js';

/**
 * @param {object} config  see config.js
 * @param {{ isReady: () => boolean, dbPing?: () => Promise<unknown>, logger?: object, fetchImpl?: typeof fetch,
 *           settings?: object, orders?: object }} deps  `settings` / `orders` replace the engagement / orders-stats
 *           clients (tests pass fakes)
 */
export function createApp(config, { isReady, dbPing = async () => {}, logger = createLogger('catalog'), fetchImpl, settings, orders } = {}) {
  setContext({
    config,
    settings: settings ?? createSettingsReader(config, { fetchImpl, logger }),
    orders: orders ?? createOrdersStats(config, { fetchImpl, logger }),
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId());
  app.use(accessLog(logger));
  // Unauthenticated, as every service: liveness only, no data. 503 until the DB is connected AND seeded.
  app.use(health({ isReady, deps: { mongo: dbPing }, commit: config.commit }));

  const internal = express.Router();
  internal.use(requireServiceAuth({ secret: config.secret, issuers: config.allowedIssuers }));
  internal.use(callerGate); // which KIND of caller may use which route family (lib/perms.js)
  internal.use(operatorGate); // operator routes: the area gate, re-checked from the signed perms

  /* Media bytes. Streamed, Range-aware; before the JSON parser (nothing to parse) and open to both BFFs only. */
  internal.use('/media', mediaRoutes({ uploadDir: config.uploadDir }));

  internal.use(express.json({ limit: '256kb' }));

  /* Read-only app routes: either BFF (the phone app, and the dashboard's own previews) or the monolith. */
  const pub = express.Router();
  pub.use(publicContentRoutes);
  pub.use(horoscope.publicRouter);
  pub.use(panchang);
  const routers = { home: home.routers(), live: live.routers({ requireAuth: requireDevotee }), poojas: poojas.routers(), chadhava: chadhava.routers() };
  for (const r of [routers.live, routers.poojas, routers.chadhava]) pub.use(r.public);
  internal.use(pub);

  /* Saying Jai: a devotee, authenticated by the mobile BFF (the uid is the token's `sub`). */
  internal.use(routers.live.devotee);

  /* The priced snapshot: the orders side only (the monolith until phase 5). */
  internal.use(pricingRoutes);

  /* The dashboard: the admin BFF only, behind the area gate (re-checked here from the signed perms). */
  const admin = express.Router();
  admin.use('/content', content);
  admin.use('/content', uploadRoutes({ maxUploadMb: config.maxUploadMb }));
  admin.use(horoscope.adminRouter);
  for (const r of Object.values(routers)) admin.use(r.admin);
  internal.use(admin);
  internal.use((_req, res) => res.status(404).json({ error: 'not found', code: 'not_found' }));

  app.use('/internal/catalog', internal);

  // HttpError -> { error, code, ...extra }; everything else goes to the shared handler (AuthError -> 401, 500 generic).
  // eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
  app.use((err, _req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    next(err);
  });
  app.use(errorHandler(logger));
  return app;
}
