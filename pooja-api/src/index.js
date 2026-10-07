/**
 * The backend, as its own service.
 *
 * It used to live inside `pooja-admin/`, which made the phone app's API a
 * subfolder of the admin tool: the app could not be served without the
 * dashboard also running, and locking the dashboard down meant locking the
 * app out. They are separate concerns on one database, and now separate
 * processes — the app talks to this, the dashboard talks to this, and
 * neither depends on the other being up.
 *
 * This serves BOTH surfaces, gated: the app's endpoints are the allowlist
 * in `admin.js`, everything else wants an operator session.
 */
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';

import { ensureFirstOperator, mountAdminAuth, requireAdmin } from './admin.js';
import { announcements, policies } from './broadcast.js';
import { auth } from './auth.js';
import { content, horoscope, panchang, publicContent, UPLOAD_DIR, users } from './content.js';
import { setLegacyDir, uploads } from './files.js';
import { connectDb } from './db.js';
import { operators } from './operators.js';
import { router } from './routes.js';

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pooja_admin';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
/*
 * The dashboard is a separate origin now, so `credentials` is load-bearing
 * rather than incidental: without it the browser will not send the admin
 * session cookie to this host at all.
 *
 * Which also means CORS_ORIGIN can no longer be '*' in production — the
 * spec forbids a wildcard origin on a credentialed request, and the browser
 * will refuse every dashboard call. Set it to the dashboard's URL.
 */
/**
 * The dashboard origins allowed to call this.
 *
 * An `Origin` header is scheme + host, and `cors` compares it as a plain
 * string, so two near-misses fail silently and identically — every call
 * refused, nothing logged:
 *   - a bare host, which is all Render's blueprint can hand over
 *     (`fromService` yields `pooja-admin.onrender.com`, no scheme);
 *   - a trailing slash, which is what you get from copying the URL out of
 *     the browser's address bar.
 * Both are normalised here rather than left for someone to debug.
 */
function allowedOrigins(raw) {
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => (/^https?:\/\//.test(o) ? o : `https://${o}`))
    .map((o) => o.replace(/\/+$/, ''));
}

app.use(
  cors({
    origin: CORS_ORIGIN === '*' ? true : allowedOrigins(CORS_ORIGIN),
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan('dev'));

// NOTE: no `GET /` handler. It used to answer with an API banner, which
// shadowed the dashboard once the UI started being served from here.
// `/api/health` is the liveness check.
/**
 * Liveness, and which build is answering.
 *
 * `commit` is what lets CI tell a finished deploy from the old container
 * still serving traffic — polling for "is it up" would pass instantly
 * against the version being replaced. Render sets RENDER_GIT_COMMIT itself.
 */
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    uptime: process.uptime(),
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
  }),
);
/*
 * Media comes out of the database, not the filesystem.
 *
 * This router also answers for anything still sitting in UPLOAD_DIR from
 * before the move, so existing rows keep resolving until `npm run
 * migrate:media` has been run.
 */
setLegacyDir(UPLOAD_DIR);
app.use('/uploads', uploads);

// Before the guard: these verify a Firebase ID token, which is a stronger
// check than the admin password and belongs to the devotee, not the operator.
app.use('/api/auth', auth); // Firebase-verified sign-in sync + profile

// The gate. Everything registered after this needs an admin session unless
// it is on the allowlist in admin.js — so a new route is private by default.
mountAdminAuth(app);
app.use('/api', requireAdmin);

app.use('/api', router);
app.use('/api', publicContent); // GET /api/content for the app
app.use('/api', horoscope); // GET /api/horoscope?date=YYYY-MM-DD
app.use('/api', panchang); // GET /api/panchang?date=YYYY-MM-DD
app.use('/api/content', content); // deities/temples/aartis CRUD + upload
app.use('/api/users', users);
app.use('/api', operators);
app.use('/api', policies);
app.use('/api', announcements);

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

/*
 * Nothing should reach these — `asyncRouter` and the handler above catch
 * what routes throw — but a rejection from a timer or a stray listener
 * would still end the process, and an API that dies on one bad request is
 * worse than one that logs and keeps serving.
 */
process.on('unhandledRejection', (reason) => {
  console.error('✗ Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught exception:', err?.stack || err);
});

connectDb(MONGODB_URI)
  // Operators live in the database now, so the first one can only be
  // created once there is a connection — not at import time.
  .then(ensureFirstOperator)
  .then(() => {
    app.listen(PORT, () =>
      console.log(`✓ API on http://localhost:${PORT}`),
    );
  })
  .catch((err) => {
    console.error('✗ Failed to start — is MongoDB running?', err.message);
    process.exit(1);
  });
