import { randomBytes } from 'node:crypto';

import express from 'express';
import { accessLog, createLogger, errorHandler, health, requestId, requireServiceAuth } from '@bhakti/common';

import { setContext } from './lib/context.js';
import { HttpError } from './lib/http-error.js';
import { createIdentityDirectory } from './lib/identity.js';
import { callerGate, operatorGate } from './lib/perms.js';
import { createPush } from './lib/push.js';
import { createRedactor } from './lib/redact.js';
import { createSettingsReader } from './lib/settings.js';
import { createWalletClient } from './lib/wallet.js';
import { astrologerRouters } from './modules/astrologers/index.js';
import { callRouters } from './modules/calls/index.js';
import { payoutRouters } from './modules/payouts/index.js';

/**
 * @param {object} config  see config.js
 * @param {{ isReady: () => boolean, dbPing?: () => Promise<unknown>, logger?: object, fetchImpl?: typeof fetch,
 *           wallet?: object, settings?: object, identity?: object, push?: object, rtc?: Function }} deps
 *        `wallet` / `settings` / `identity` / `push` replace the clients (tests pass fakes); `fetchImpl` is fetch for the default clients;
 *        `rtc` replaces the audio-provider resolution
 */
export function createApp(config, { isReady, dbPing = async () => {}, logger = createLogger('calls'), fetchImpl, wallet, settings, identity, push, rtc } = {}) {
  let sessionSecret = config.sessionSecret;
  if (!sessionSecret || sessionSecret.length < 16) {
    sessionSecret = randomBytes(32).toString('hex');
    logger.warn('ADMIN_SESSION_SECRET is not set (or shorter than 16 characters): devotee pseudonyms in the admin lists change on every restart. Use the same value as the admin BFF.');
  }
  const ids = identity ?? createIdentityDirectory(config, { fetchImpl, logger });
  const rules = settings ?? createSettingsReader(config, { fetchImpl, logger });
  setContext({
    config,
    log: logger,
    wallet: wallet ?? createWalletClient(config, { fetchImpl, logger }),
    settings: rules,
    identity: ids,
    push: push ?? createPush(config, { identity: ids, settings: rules, fetchImpl, logger }),
    redact: createRedactor(sessionSecret),
    rtc: rtc ?? null,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId());
  app.use(accessLog(logger));
  // Unauthenticated, as every service: liveness only, no data. 503 until the DB is connected AND ready.
  app.use(health({ isReady, deps: { mongo: dbPing }, commit: config.commit }));

  const internal = express.Router();
  internal.use(requireServiceAuth({ secret: config.secret, issuers: config.allowedIssuers }));
  internal.use(callerGate); // which KIND of caller may use which route family (lib/perms.js)
  internal.use(express.json({ limit: '256kb' }));
  internal.use(operatorGate); // /admin/...: the area gate, re-checked from the signed perms

  const astrologers = astrologerRouters();
  const calls = callRouters();
  const payouts = payoutRouters();
  for (const r of [astrologers.directory, astrologers.public, astrologers.devotee, calls.devotee, payouts.devotee, astrologers.admin, calls.admin, payouts.admin]) internal.use(r);
  internal.use((_req, res) => res.status(404).json({ error: 'not found', code: 'not_found' }));

  app.use('/internal/calls', internal);

  // HttpError -> { error, code, ...extra }; everything else goes to the shared handler (AuthError -> 401, 500 generic).
  // eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
  app.use((err, _req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    next(err);
  });
  app.use(errorHandler(logger));
  return app;
}
