import crypto from 'crypto';

import { config } from '../../config/env.js';

export const COOKIE = 'pooja_admin';
export const MAX_AGE_MS = 12 * 60 * 60 * 1000; // a working day

export const IS_PROD = config.isProduction;

/** Signing key for the session cookie — see `config/env.js`. */
const SECRET = config.sessionSecret;

export function sign(payload) {
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

/**
 * How the session cookie travels.
 *
 * `Strict` is the default and the safer answer: another site cannot cause
 * the browser to attach this cookie at all, which is what makes a CSRF
 * token unnecessary. It works whenever the dashboard and the API share an
 * origin — true in dev, where Vite proxies /api.
 *
 * A dashboard deployed as its own site is cross-origin, and Strict means
 * the browser never sends the cookie: sign-in appears to succeed and every
 * subsequent call is 401. That needs `SESSION_SAMESITE=None`, which the
 * spec only honours alongside `Secure`, so it also requires HTTPS.
 *
 * What is given up with None, and why it is tolerable here: CORS is pinned
 * to one origin, every write takes a JSON body (which a cross-site form
 * cannot send without a preflight) and every destructive method is
 * non-simple, so the browser preflights it and CORS refuses. A real CSRF
 * token would still be better; this is the honest state of it.
 */
export const SAMESITE = config.sessionSameSite;
export const CROSS_SITE = SAMESITE.toLowerCase() === 'none';

export function setCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    [
      `${COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      `SameSite=${SAMESITE}`,
      `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
      // SameSite=None is ignored without Secure, so it is not optional there.
      IS_PROD || CROSS_SITE ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; '),
  );
}
