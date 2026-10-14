import { randomBytes } from 'node:crypto';

import express from 'express';
import { accessLog, createLogger, errorHandler, health, requestId, requireServiceAuth } from '@bhakti/common';

import { setContext } from './lib/context.js';
import { createSettingsReader } from './lib/engagement.js';
import { HttpError } from './lib/http-error.js';
import { createIdentityDirectory } from './lib/identity.js';
import { asyncRouter } from './lib/async-handler.js';
import { callerGate, operatorGate } from './lib/perms.js';
import { createRedactor } from './lib/redact.js';
import { coinsRouters, webhookRoute } from './modules/coins/index.js';
import { ledgerRoutes, walletRouters } from './modules/wallet/index.js';

/**
 * @param {object} config  see config.js
 * @param {{ isReady: () => boolean, dbPing?: () => Promise<unknown>, logger?: object, fetchImpl?: typeof fetch,
 *           settings?: object, identity?: object }} deps  `settings` / `identity` replace the engagement / identity clients
 *           (tests pass fakes); `fetchImpl` is fetch for Razorpay's order API and for the default clients
 */
export function createApp(config, { isReady, dbPing = async () => {}, logger = createLogger('wallet'), fetchImpl, settings, identity } = {}) {
  let sessionSecret = config.sessionSecret;
  if (!sessionSecret || sessionSecret.length < 16) {
    sessionSecret = randomBytes(32).toString('hex');
    logger.warn('ADMIN_SESSION_SECRET is not set (or shorter than 16 characters): devotee pseudonyms in the admin lists change on every restart. Use the same value as the admin BFF.');
  }
  setContext({
    config,
    settings: settings ?? createSettingsReader(config, { fetchImpl, logger }),
    identity: identity ?? createIdentityDirectory(config, { fetchImpl, logger }),
    redact: createRedactor(sessionSecret),
    fetchImpl: fetchImpl ?? ((...a) => fetch(...a)),
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

  /* Razorpay's webhook: the BYTES, untouched (the signature is over them), so before the JSON parser. */
  const webhook = asyncRouter();
  webhook.post('/webhooks/razorpay', express.raw({ type: () => true, limit: '1mb' }), webhookRoute);
  internal.use(webhook);

  internal.use(express.json({ limit: '256kb' }));
  internal.use(operatorGate); // /admin/...: the area gate, re-checked from the signed perms

  internal.use(ledgerRoutes()); // debit / refund / credit / txn / balance / reconcile - the order-side callers

  const w = walletRouters();
  const c = coinsRouters();
  for (const r of [c.public, w.devotee, c.devotee, w.admin, c.admin]) internal.use(r);
  internal.use((_req, res) => res.status(404).json({ error: 'not found', code: 'not_found' }));

  app.use('/internal/wallet', internal);

  // HttpError -> { error, code, ...extra }; everything else goes to the shared handler (AuthError -> 401, 500 generic).
  // eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
  app.use((err, _req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    next(err);
  });
  app.use(errorHandler(logger));
  return app;
}
