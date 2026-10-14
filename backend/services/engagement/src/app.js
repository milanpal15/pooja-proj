import express from 'express';
import { accessLog, errorHandler, health, requestId, requireServiceAuth } from '@bhakti/common';
import { createLogger } from '@bhakti/common';

import { HttpError } from './lib/http-error.js';
import { analyticsRoutes } from './routes/analytics.js';
import { announcementAdminRoutes, announcementPushRoutes, announcementRoutes } from './routes/announcements.js';
import { flagRoutes } from './routes/flags.js';
import { settingAdminRoutes, settingRoutes } from './routes/settings.js';

/**
 * @param {object} config  see config.js
 * @param {{ isReady: () => boolean, dbPing?: () => Promise<unknown>, logger?: object, fetchImpl?: typeof fetch }} deps
 */
export function createApp(config, { isReady, dbPing = async () => {}, logger = createLogger('engagement'), fetchImpl } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId());
  app.use(accessLog(logger));
  // Unauthenticated, as every service: liveness only, no data. 503 until the DB is connected AND seeded.
  app.use(health({ isReady, deps: { mongo: dbPing }, commit: config.commit }));

  const internal = express.Router();
  internal.use(requireServiceAuth({ secret: config.secret, issuers: config.allowedIssuers }));
  internal.use(express.json({ limit: '256kb' }));
  internal.use(flagRoutes);
  internal.use(settingRoutes);
  internal.use('/admin/settings', settingAdminRoutes);
  internal.use(announcementRoutes);
  internal.use('/admin/announcements', announcementAdminRoutes);
  internal.use(announcementPushRoutes({ expoPushUrl: config.expoPushUrl, fetchImpl }));
  internal.use(analyticsRoutes);
  app.use('/internal/engagement', internal);

  // HttpError -> { error, code, ...extra }; everything else goes to the shared handler (AuthError -> 401, 500 generic).
  // eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
  app.use((err, _req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    next(err);
  });
  app.use(errorHandler(logger));
  return app;
}
