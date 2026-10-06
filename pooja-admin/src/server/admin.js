import crypto from 'crypto';

import { Operator } from './models.js';

/**
 * The gate in front of the dashboard, and who is allowed through which part.
 *
 * Until this existed every route was open. On localhost that was merely
 * untidy; on a public URL it meant anyone who found the address could
 * rewrite the prices and **delete devotees** — which deletes their Firebase
 * accounts too.
 *
 * ── Fail closed ────────────────────────────────────────────────────────
 *
 * `PUBLIC` names the endpoints the PHONE APP needs. Everything else under
 * /api requires a signed-in operator. That direction matters: a route added
 * later is protected because nobody remembered to protect it, rather than
 * exposed because nobody remembered to.
 *
 * ── Two roles ──────────────────────────────────────────────────────────
 *
 * `editor` writes content. `admin` does that and everything else. The line
 * is drawn at the things that are not content: devotee accounts, feature
 * flags, payments, analytics, and the operator list itself. Whoever writes
 * the daily horoscope has no business deleting a devotee.
 */

const PUBLIC = [
  // Liveness, for the host's health check.
  { method: 'GET', path: /^\/health$/ },

  // Feature flags and content the app reads on launch.
  { method: 'GET', path: /^\/flags$/ },
  { method: 'GET', path: /^\/content$/ },
  { method: 'GET', path: /^\/horoscope$/ },
  { method: 'GET', path: /^\/panchang$/ },
  { method: 'GET', path: /^\/announcements$/ },
  { method: 'GET', path: /^\/policy\/[^/]+$/ },

  // Written by the app, not by a person at a keyboard.
  { method: 'POST', path: /^\/policy\/[^/]+\/accept$/ },
  { method: 'POST', path: /^\/ingest\/(session|screen|payment)$/ },
  { method: 'POST', path: /^\/push\/register$/ },

  // The session endpoints themselves, or you could never sign in.
  { method: 'POST', path: /^\/admin\/login$/ },
  { method: 'POST', path: /^\/admin\/logout$/ },
  { method: 'GET', path: /^\/admin\/session$/ },
];

/**
 * Admin-only. Everything else behind the gate is open to an editor.
 *
 * Listed as what an editor must NOT reach, rather than what they may, so a
 * new *content* route is editable by default while a new *administrative*
 * one has to be added here deliberately. That is the right way round:
 * forgetting to list a content route costs an editor nothing, forgetting to
 * list an admin route is caught by the admin-only default on anything that
 * manages people or money.
 */
const ADMIN_ONLY = [
  /^\/users(\/|$)/, // devotee accounts — block and delete
  /^\/flags(\/|$)/, // feature flags (the app's public GET /flags is above)
  /^\/analytics(\/|$)/,
  /^\/payments$/,
  /^\/visitors$/,
  /^\/admin\/operators(\/|$)/, // the operator list itself
  /^\/admin\/policies(\/|$)/, // terms a devotee has to accept
  /^\/admin\/announcements\/[^/]+\/push$/, // pushes to every device
];

const COOKIE = 'pooja_admin';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // a working day

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Signing key for the session cookie.
 *
 * Set ADMIN_SESSION_SECRET in any real deployment. Without one a random key
 * is generated per boot, which is safe but signs everyone out on restart.
 */
const SECRET =
  process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

/* ──────────────────────────────────────────────────────────── passwords ── */

/** scrypt, salted per password. Never store or log the password itself. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  // Constant-time: a plain === leaks how much of the hash was right.
  return crypto.timingSafeEqual(actual, expected);
}

/* ───────────────────────────────────────────────────────────── sessions ── */

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

/** Returns the session payload, or null. Never throws on malformed input. */
function read(token) {
  if (typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Parse one cookie out of the header, so cookie-parser is not a dependency. */
function cookieValue(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const sessionOf = (req) => read(cookieValue(req, COOKIE));

function setCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    [
      `${COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      // Strict is what makes a CSRF token unnecessary: another site cannot
      // cause the browser to attach this cookie at all.
      'SameSite=Strict',
      `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
      IS_PROD ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; '),
  );
}

/* ──────────────────────────────────────────────────────────── bootstrap ── */

/**
 * Make sure somebody can sign in.
 *
 * On an empty operator collection, create one admin from ADMIN_USERNAME /
 * ADMIN_PASSWORD. That keeps the existing env contract working and means an
 * upgrade from the shared-password version is not a lockout.
 *
 * Production refuses to start without a password for the same reason it did
 * before: an admin API anyone can use is not a degraded mode worth running.
 */
export async function ensureFirstOperator() {
  const password = process.env.ADMIN_PASSWORD || '';
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();

  const count = await Operator.countDocuments();
  if (count > 0) return;

  if (!password) {
    if (IS_PROD) {
      console.error(
        '✗ No operators exist and ADMIN_PASSWORD is not set.\n' +
          '  Refusing to start: there would be no way to sign in, and the\n' +
          '  dashboard would be open to anyone. Set ADMIN_PASSWORD.',
      );
      process.exit(1);
    }
    console.warn(
      '⚠ No operators and no ADMIN_PASSWORD — the dashboard is UNPROTECTED.\n' +
        '  Fine on localhost. Production refuses to start like this.',
    );
    return;
  }

  await Operator.create({ username, passwordHash: hashPassword(password), role: 'admin' });
  console.log(`✓ Created the first operator "${username}" (admin) from ADMIN_PASSWORD`);
}

/** True once at least one operator exists — i.e. sign-in is required. */
async function authRequired() {
  return (await Operator.countDocuments({ active: true })) > 0;
}

/* ─────────────────────────────────────────────────────────────── routes ── */

export function mountAdminAuth(app) {
  app.post('/api/admin/login', async (req, res) => {
    if (!(await authRequired())) return res.json({ ok: true, required: false });

    const username = String(req.body?.username ?? '').toLowerCase().trim();
    const password = String(req.body?.password ?? '');

    const operator = await Operator.findOne({ username, active: true });
    // Hash even when the user does not exist, so a missing username and a
    // wrong password take the same time and cannot be told apart.
    const ok = operator
      ? verifyPassword(password, operator.passwordHash)
      : verifyPassword(password, hashPassword('never-matches'));

    if (!operator || !ok) return res.status(401).json({ error: 'Wrong username or password' });

    await Operator.updateOne({ _id: operator._id }, { $set: { lastLogin: new Date() } });
    setCookie(res, sign({ uid: String(operator._id), role: operator.role, exp: Date.now() + MAX_AGE_MS }));
    res.json({ ok: true, required: true, username: operator.username, role: operator.role });
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    res.json({ ok: true });
  });

  /** Lets the dashboard pick between the login screen and the real UI. */
  app.get('/api/admin/session', async (req, res) => {
    const required = await authRequired();
    const s = sessionOf(req);
    if (!required) return res.json({ required: false, authed: true, role: 'admin' });
    if (!s) return res.json({ required: true, authed: false });

    // Read the role back from the record, not the cookie: a demotion must
    // take effect on the next request, not when the session happens to end.
    const operator = await Operator.findById(s.uid).lean();
    if (!operator || !operator.active) return res.json({ required: true, authed: false });
    res.json({ required: true, authed: true, username: operator.username, role: operator.role });
  });
}

/* ──────────────────────────────────────────────────────────────── guard ── */

/** Mount with `app.use('/api', requireAdmin)` BEFORE the routers. */
export async function requireAdmin(req, res, next) {
  if (PUBLIC.some((r) => r.method === req.method && r.path.test(req.path))) return next();

  // No operators at all means a local dev database nobody has set up; the
  // warning on boot covers it, and production will not have booted.
  if (!(await authRequired())) return next();

  const s = sessionOf(req);
  if (!s) return res.status(401).json({ error: 'Sign in required' });

  const operator = await Operator.findById(s.uid).lean();
  if (!operator || !operator.active) {
    return res.status(401).json({ error: 'Sign in required' });
  }

  if (operator.role !== 'admin' && ADMIN_ONLY.some((p) => p.test(req.path))) {
    return res.status(403).json({ error: 'This needs an admin account' });
  }

  req.operator = { id: String(operator._id), username: operator.username, role: operator.role };
  next();
}
