import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';

import { ensureFirstOperator, mountAdminAuth, requireAdmin } from './admin.js';
import { announcements, policies } from './broadcast.js';
import { auth } from './auth.js';
import { content, horoscope, panchang, publicContent, UPLOAD_DIR, users } from './content.js';
import { connectDb } from './db.js';
import { operators } from './operators.js';
import { router } from './routes.js';

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pooja_admin';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
// `credentials` so the admin session cookie survives a cross-origin
// dashboard; harmless when the UI is served from this same process.
app.use(
  cors({
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
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
app.use('/uploads', express.static(UPLOAD_DIR));

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

/* ------------------------------------------------- the dashboard itself -- */

/**
 * The admin UI is served by this same process.
 *
 * It used to be a second app on :5173 that you had to start separately and
 * point at the API with VITE_API_BASE — two terminals, two ports, and CORS
 * between them for no reason. Building the client and serving it from here
 * makes the dashboard one thing: `npm start` gives you API and UI on :4000.
 *
 * `npm run dev` still runs Vite separately for hot reload; it proxies /api
 * back here, so the client never needs to know an absolute API URL again.
 */
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));

  // SPA fallback. Anything that is not an API call or an upload is a route
  // inside the dashboard, so hand back index.html and let the client router
  // sort it out. Registered last so it cannot shadow a real endpoint.
  app.get(/^\/(?!api|uploads).*/, (_req, res) => {
    res.sendFile(join(CLIENT_DIST, 'index.html'));
  });
} else {
  console.warn(
    '⚠ Dashboard UI not built — serving the API only.\n' +
      '  Run `npm run build` in pooja-admin/ (or `npm start`, which builds first).',
  );
}

connectDb(MONGODB_URI)
  // Operators live in the database now, so the first one can only be
  // created once there is a connection — not at import time.
  .then(ensureFirstOperator)
  .then(() => {
    app.listen(PORT, () =>
      console.log(
        existsSync(CLIENT_DIST)
          ? `✓ Admin dashboard + API on http://localhost:${PORT}`
          : `✓ API on http://localhost:${PORT} (dashboard not built)`,
      ),
    );
  })
  .catch((err) => {
    console.error('✗ Failed to start — is MongoDB running?', err.message);
    process.exit(1);
  });
