import { randomBytes } from 'node:crypto';

import express from 'express';
import { accessLog, createLogger, errorHandler, health, requestId, requireServiceAuth } from '@bhakti/common';

import { createEngine } from './engine/engine.js';
import { createCatalogClient } from './lib/catalog-client.js';
import { createIdentityDirectory } from './lib/identity-directory.js';
import { createRedactor } from './lib/redact.js';
import { createWalletClient } from './lib/wallet-client.js';
import { HttpError } from './lib/http-error.js';
import { callerGate, operatorGate } from './lib/perms.js';
import { adminEventRoutes } from './routes/admin-events.js';
import { badgeRoutes } from './routes/badges.js';
import { directoryRoutes } from './routes/directory.js';
import { publicRoutes } from './routes/public.js';
import { typeRoutes } from './routes/types.js';

/**
 * @param {object} config  see config.js
 * @param {{ isReady: () => boolean, dbPing?: () => Promise<unknown>, logger?: object, fetchImpl?: typeof fetch,
 *           catalog?: {exists:(type:string, slug:string)=>Promise<boolean>}, now?: () => Date,
 *           wallet?: {credit:Function}, directory?: {lookup:Function} }} deps
 *        `catalog` replaces the catalog client (tests pass a stub); `now` is the clock the derived status and the engine read;
 *        `wallet` / `directory` replace the wallet and identity clients (tests pass fakes). `fetchImpl` is fetch for the default clients.
 *        The engine is returned as `app.locals.engine` / `app.locals.wallet` so server.js can start the reward sweeper on the same wallet.
 */
export function createApp(config, { isReady, dbPing = async () => {}, logger = createLogger('events'), fetchImpl, catalog, now = () => new Date(), wallet, directory } = {}) {
  const lookupCatalog = catalog ?? createCatalogClient(config, { fetchImpl });
  let sessionSecret = config.sessionSecret;
  if (!sessionSecret || sessionSecret.length < 16) {
    sessionSecret = randomBytes(32).toString('hex');
    logger.warn('ADMIN_SESSION_SECRET is not set (or shorter than 16 characters): devotee pseudonyms in the participants list change on every restart. Use the same value as the admin BFF.');
  }
  const walletClient = wallet ?? createWalletClient(config, { fetchImpl });
  const engine = createEngine({ wallet: walletClient, now, logger });

  const app = express();
  app.locals.engine = engine;
  app.locals.wallet = walletClient;
  app.disable('x-powered-by');
  app.use(requestId());
  app.use(accessLog(logger));
  // Unauthenticated, as every service: liveness only, no data. 503 until the DB is connected AND seeded.
  app.use(health({ isReady, deps: { mongo: dbPing }, commit: config.commit }));

  const internal = express.Router();
  internal.use(requireServiceAuth({ secret: config.secret, issuers: config.allowedIssuers }));
  internal.use(callerGate); // which KIND of caller may use which route family (lib/perms.js)
  internal.use(operatorGate); // operator routes: the area gate, re-checked from the signed perms
  internal.use(express.json({ limit: '512kb' }));

  internal.use('/public', publicRoutes({ now, engine }));
  internal.use('/directory', directoryRoutes()); // identity only: a devotee's registrations + badges, read-only (Users 360)
  internal.use('/admin/event-types', typeRoutes());
  internal.use('/admin/event-badges', badgeRoutes());
  internal.use('/admin/events', adminEventRoutes({ catalog: lookupCatalog, now, redact: createRedactor(sessionSecret), directory: directory ?? createIdentityDirectory(config, { fetchImpl, logger }) }));
  internal.use((_req, res) => res.status(404).json({ error: 'not found', code: 'not_found' }));
  app.use('/internal/events', internal);

  // HttpError -> { error, code, ...extra }; everything else goes to the shared handler (AuthError -> 401, 500 generic).
  // eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
  app.use((err, _req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    next(err);
  });
  app.use(errorHandler(logger));
  return app;
}
