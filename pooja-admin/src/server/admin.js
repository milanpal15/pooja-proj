import crypto from 'crypto';

/**
 * The gate in front of the dashboard.
 *
 * Until this existed every route was open. On localhost that was merely
 * untidy; on a public URL it meant anyone who found the address could rewrite
 * the prices, post announcements, and **delete devotees** — which deletes
 * their Firebase accounts too. So this is a deployment prerequisite, not a
 * feature.
 *
 * ── Fail closed ────────────────────────────────────────────────────────
 *
 * The allowlist below names the endpoints the PHONE APP needs. Everything
 * else under /api requires an admin session. That direction matters: a route
 * added later is protected because nobody remembered to protect it, rather
 * than exposed because nobody remembered to.
 *
 * The app's own authenticated routes (/api/auth/*) are not covered here —
 * they verify a Firebase ID token, which is a stronger check than this one.
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

  // The session endpoints themselves, or you could never log in.
  { method: 'POST', path: /^\/admin\/login$/ },
  { method: 'POST', path: /^\/admin\/logout$/ },
  { method: 'GET', path: /^\/admin\/session$/ },
];

const COOKIE = 'pooja_admin';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // a working day

const PASSWORD = process.env.ADMIN_PASSWORD || '';
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Signing key for the session cookie.
 *
 * Derived from the password when none is given, so a restart invalidates
 * sessions only when the password itself changes. Set ADMIN_SESSION_SECRET
 * to keep sessions alive across a password rotation, or to share them
 * between instances behind a load balancer.
 */
const SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash('sha256').update(`pooja:${PASSWORD}`).digest('hex');

/** Whether a password was configured at all. */
export const adminAuthConfigured = () => PASSWORD.length > 0;

/**
 * Refuse to boot a public deployment with no password.
 *
 * An open admin API is not a degraded mode worth running — it is the whole
 * problem. In development it stays open, loudly, because a password on
 * localhost is friction with nothing on the other side of it.
 */
export function assertAdminAuthReady() {
  if (adminAuthConfigured()) return;
  if (IS_PROD) {
    console.error(
      '✗ ADMIN_PASSWORD is not set.\n' +
        '  Refusing to start: in production that would publish an admin API\n' +
        '  that anyone can use to edit content and delete devotees.\n' +
        '  Set ADMIN_PASSWORD in the environment and restart.',
    );
    process.exit(1);
  }
  console.warn(
    '⚠ ADMIN_PASSWORD is not set — the dashboard is UNPROTECTED.\n' +
      '  Fine on localhost. Never deploy like this; production refuses to start.',
  );
}

/* ───────────────────────────────────────────────────────────── sessions ── */

function sign(expiry) {
  const mac = crypto.createHmac('sha256', SECRET).update(String(expiry)).digest('hex');
  return `${expiry}.${mac}`;
}

function verify(token) {
  if (typeof token !== 'string') return false;
  const [expiry, mac] = token.split('.');
  if (!expiry || !mac) return false;
  if (Number(expiry) < Date.now()) return false;

  const expected = crypto.createHmac('sha256', SECRET).update(expiry).digest('hex');
  // Constant-time: a plain === leaks how much of the MAC was right, one
  // byte at a time, to anyone willing to make enough requests.
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

export const hasAdminSession = (req) => verify(cookieValue(req, COOKIE));

/* ─────────────────────────────────────────────────────────────── routes ── */

export function mountAdminAuth(app) {
  app.post('/api/admin/login', (req, res) => {
    if (!adminAuthConfigured()) return res.json({ ok: true, required: false });

    const given = String(req.body?.password ?? '');
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(PASSWORD).digest();
    if (!crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    const token = sign(Date.now() + MAX_AGE_MS);
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
    res.json({ ok: true, required: true });
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    res.json({ ok: true });
  });

  /** Lets the dashboard decide between a login screen and the real UI. */
  app.get('/api/admin/session', (req, res) =>
    res.json({ required: adminAuthConfigured(), authed: !adminAuthConfigured() || hasAdminSession(req) }),
  );
}

/* ──────────────────────────────────────────────────────────────── guard ── */

/**
 * Mount with `app.use('/api', requireAdmin)` BEFORE the routers.
 *
 * `req.path` here is relative to the mount point, so the patterns above are
 * written without the /api prefix.
 */
export function requireAdmin(req, res, next) {
  if (!adminAuthConfigured()) return next(); // development only; see above
  if (PUBLIC.some((r) => r.method === req.method && r.path.test(req.path))) return next();
  if (hasAdminSession(req)) return next();
  return res.status(401).json({ error: 'Admin sign-in required' });
}
