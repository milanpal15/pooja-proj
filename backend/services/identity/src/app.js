import { randomBytes } from 'node:crypto';

import express from 'express';
import { accessLog, createLogger, errorHandler, health, requestId, requireServiceAuth } from '@bhakti/common';

import { createAstrologerClient } from './lib/astrologer-client.js';
import { createRedactor } from './lib/redact.js';
import { createUserSources } from './lib/sources.js';
import { createFcmSender } from './lib/fcm.js';
import { createFirebase } from './lib/firebase.js';
import { HttpError } from './lib/http-error.js';
import { createPushService } from './lib/push.js';
import { authRoutes } from './routes/auth.js';
import { blockedDeviceRoutes } from './routes/blocked-devices.js';
import { directoryRoutes, statusRoutes } from './routes/directory.js';
import { operatorRoutes } from './routes/operators.js';
import { policyRoutes } from './routes/policies.js';
import { pushRoutes } from './routes/push.js';
import { roleRoutes } from './routes/roles.js';
import { userAdminRoutes } from './routes/users-admin.js';

/**
 * @param {object} config  see config.js
 * @param {{ isReady: () => boolean, dbPing?: () => Promise<unknown>, logger?: object, firebase?: object, astrologers?: object, fetchImpl?: typeof fetch, fcm?: { send: Function }, sources?: object, now?: () => Date }} deps
 *        `firebase` ({ revokeUser, deleteFirebaseUser }), `astrologers` ({ claim, active }), `fcm` ({ send(message) }), `sources` (the by-uid reads of the Users 360,
 *        lib/sources.js) and `now` (the clock the block rules read) are injectable for tests.
 */
export function createApp(config, { isReady, dbPing = async () => {}, logger = createLogger('identity'), firebase, astrologers, fetchImpl, fcm, sources, now = () => new Date() } = {}) {
  let sessionSecret = config.sessionSecret;
  if (!sessionSecret || sessionSecret.length < 16) {
    sessionSecret = randomBytes(32).toString('hex');
    logger.warn('ADMIN_SESSION_SECRET is not set (or shorter than 16 characters): devotee pseudonyms in the Users list change on every restart. Use the same value as the admin BFF.');
  }
  const userSources = sources ?? createUserSources(config, { fetchImpl });
  const fb = firebase ?? createFirebase(config, { logger });
  const push = createPushService({ sender: fcm ?? createFcmSender({ messaging: () => fb.messaging?.() ?? null }), logger });
  const astro = astrologers ?? createAstrologerClient(config, { fetchImpl });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId());
  app.use(accessLog(logger));
  // Unauthenticated, as every service: liveness only, no data. 503 until the DB is connected AND seeded.
  app.use(health({ isReady, deps: { mongo: dbPing }, commit: config.commit }));

  const ops = operatorRoutes();
  const policies = policyRoutes();
  const devices = blockedDeviceRoutes({ now });

  const internal = express.Router();
  internal.use(requireServiceAuth({ secret: config.secret, issuers: config.allowedIssuers }));
  internal.use(express.json({ limit: '256kb' }));
  internal.use('/auth', authRoutes({ astrologers: astro, now })); // devotee (mobile-bff)
  internal.use(policies.pub); // /policy/:key, /policy/:key/accept
  internal.use('/admin/policies', policies.admin); // operator (admin-bff)
  internal.use('/admin/users', userAdminRoutes({ firebase: fb, sources: userSources, redact: createRedactor(sessionSecret), config, now, logger })); // Users 360 (docs/USERS.md)
  internal.use('/admin/blocked-devices', devices.admin);
  internal.use('/devices', devices.device); // mobile-bff: is this device blocked?
  internal.use('/operators', ops.session);
  internal.use('/admin/operators', ops.crud);
  internal.use('/admin/roles', roleRoutes()); // custom roles (docs/ROLES.md)
  internal.use('/audit', ops.audit);
  internal.use('/admin/audit-log', ops.auditRead);
  internal.use('/directory', directoryRoutes()); // other services
  internal.use('/push', pushRoutes({ push })); // the phone registers (mobile-bff); calls / orders / engagement send
  internal.use(statusRoutes({ now })); // /users/:uid/status
  app.use('/internal/identity', internal);

  // HttpError -> { error, code, ...extra }; everything else goes to the shared handler (AuthError -> 401, 500 generic).
  // eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
  app.use((err, _req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    // A failed call to the astrologer owner (calls service, or the monolith while CALLS_URL is unset) that nobody handled: a clear 503, never a 500.
    if (err?.name === 'ServiceError') return res.status(err.status >= 500 ? 503 : err.status).json({ error: 'upstream_unavailable', code: 'upstream_unavailable' });
    next(err);
  });
  app.use(errorHandler(logger));
  return app;
}
