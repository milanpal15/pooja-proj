/**
 * Assembles the Express app: middleware order, mounts, error handler.
 *
 * No business logic and no listening — `server.js` boots it. The ORDER of the
 * `app.use` calls below is the security model (the admin gate sits in the
 * middle of it), so it is preserved exactly; do not reorder for tidiness.
 */
import express from 'express';
import morgan from 'morgan';

import { corsMiddleware } from './config/cors.js';
import { config } from './config/env.js';
import { health } from './health.js';
import { requireAdmin } from './middleware/access.js';
import { announcements } from './modules/announcements/index.js';
import { policies } from './modules/policies/index.js';
import { auth } from './modules/auth/index.js';
import { content } from './modules/content/index.js';
import { horoscope } from './modules/horoscope/index.js';
import { panchang } from './modules/panchang/index.js';
import { publicContent } from './modules/public/index.js';
import { users } from './modules/users/index.js';
import { setLegacyDir, uploads } from './modules/media/index.js';
import { auditWrites, mountAdminAuth, operators } from './modules/operators/index.js';
import { analytics } from './modules/analytics/index.js';
import { flags } from './modules/flags/index.js';
import { mountAdminModules, mountOpenModules } from './modules/index.js';

export function createApp() {
  const app = express();
  // Deployed behind one reverse proxy (Render). Without this `req.ip` is the proxy's
  // address for everybody, so the login throttle would treat every operator as one client.
  if (config.isProduction) app.set('trust proxy', 1);
  app.use(corsMiddleware());
  /*
   * Razorpay signs the exact bytes it sends, and re-serialising parsed JSON does
   * not reproduce them. So the raw body is kept — for webhooks only, so no other
   * request pays for the copy — and the webhook verifies the HMAC against it.
   */
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf;
      },
    }),
  );
  app.use(morgan('dev'));

  // NOTE: no `GET /` handler. It used to answer with an API banner, which
  // shadowed the dashboard once the UI started being served from here.
  // `/api/health` is the liveness check.
  app.get('/api/health', health); // liveness + which build is answering
  /*
   * Media comes out of the database, not the filesystem.
   *
   * This router also answers for anything still sitting in UPLOAD_DIR from
   * before the move, so existing rows keep resolving until `npm run
   * migrate:media` has been run.
   */
  setLegacyDir(config.uploadDir);
  app.use('/uploads', uploads);

  // Before the guard: these verify a Firebase ID token, which is a stronger
  // check than the admin password and belongs to the devotee, not the operator.
  app.use('/api/auth', auth); // Firebase-verified sign-in sync + profile
  // Feature modules the phone app uses (wallet, coins, bookings, calls …): each
  // route is either explicitly public or verifies the Firebase token itself.
  mountOpenModules(app);

  // The gate. Everything registered after this needs an admin session unless
  // it is on the allowlist in middleware/access.js — so a new route is private by default.
  mountAdminAuth(app);
  app.use('/api', requireAdmin);
  app.use('/api', auditWrites); // every successful operator write, no bodies

  app.use('/api', flags);
  app.use('/api', analytics);
  app.use('/api', publicContent); // GET /api/content for the app
  app.use('/api', horoscope); // GET /api/horoscope?date=YYYY-MM-DD
  app.use('/api', panchang); // GET /api/panchang?date=YYYY-MM-DD
  app.use('/api/content', content); // deities/temples/aartis CRUD + upload
  app.use('/api/users', users);
  app.use('/api', operators);
  app.use('/api', policies);
  app.use('/api', announcements);
  mountAdminModules(app); // dashboard side of the feature modules (/api/admin/...)

  /**
   * Last resort for anything a route threw.
   *
   * Must be mounted after every route, and must take four arguments — that
   * arity is how Express recognises an error handler at all.
   *
   * Paired with `asyncRouter`, which is what actually delivers a rejected
   * promise here instead of letting it become an unhandled rejection. The
   * message is deliberately generic: a stack trace or a Mongo error string
   * in the response body tells an attacker about the schema.
   */
  // eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
  app.use('/api', (err, _req, res, _next) => {
    console.error('✗ Unhandled error:', err?.stack || err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
