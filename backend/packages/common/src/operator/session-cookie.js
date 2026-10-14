import crypto from 'node:crypto';

/**
 * The operator session cookie, owned by the admin BFF from the identity phase (copied from
 * pooja-api/src/modules/operators/session.js: same name, same payload `{uid, role, exp}`, same HMAC, same attributes).
 *
 * SameSite: `Strict` is the default (another site cannot cause the browser to attach this cookie, which is what makes a
 * CSRF token unnecessary) and works whenever the dashboard and the API share an origin (dev, Vite proxying /api). A
 * dashboard deployed as its own site is cross-origin and needs `SESSION_SAMESITE=None`, which browsers only honour with
 * `Secure` (HTTPS) and which also needs CORS pinned to the dashboard's exact origin - see the BFF's config.
 * The cookie is stateless: role and `active` are re-read from identity on every request, never trusted from it.
 */
export const COOKIE = 'pooja_admin';
export const MAX_AGE_MS = 12 * 60 * 60 * 1000; // a working day

export function createSessionCookies({ secret, sameSite = 'Strict', isProduction = false, now = () => Date.now() }) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('The session secret is missing or shorter than 16 characters.');
  const crossSite = String(sameSite).toLowerCase() === 'none';
  const secure = isProduction || crossSite ? '; Secure' : ''; // SameSite=None is ignored without Secure

  const mac = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${mac(body)}`;
  }

  /** The payload, or null. Never throws on malformed input. */
  function read(token) {
    if (typeof token !== 'string') return null;
    const [body, m] = token.split('.');
    if (!body || !m) return null;
    const a = Buffer.from(m);
    const b = Buffer.from(mac(body));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!payload?.exp || payload.exp < now()) return null;
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
      if (part.slice(0, i).trim() === name) {
        try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
      }
    }
    return null;
  }

  return {
    sign,
    sessionOf: (req) => read(cookieValue(req, COOKIE)),
    set(res, payload) {
      res.setHeader('Set-Cookie', [`${COOKIE}=${encodeURIComponent(sign({ ...payload, exp: now() + MAX_AGE_MS }))}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`, secure.slice(2)].filter(Boolean).join('; '));
    },
    clear(res) {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`);
    },
  };
}
