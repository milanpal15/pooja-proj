/**
 * Service-to-service tokens, mirroring backend/packages/common/src/jwt.js EXACTLY (pooja-api cannot import
 * @bhakti/common): HS256, claims { iss, sub, role, perms, reqId, [ctx], iat, exp }, 60 s expiry, pure node:crypto.
 * If the shared package's format changes, change this file in the same commit.
 */
import crypto from 'node:crypto';

export const DEFAULT_TTL_SEC = 60;
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const mac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function needSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('INTERNAL_JWT_SECRET is missing or shorter than 16 characters.');
}

export function signServiceToken(claims, { secret, ttlSec = DEFAULT_TTL_SEC, now = Date.now() } = {}) {
  needSecret(secret);
  if (!claims?.iss) throw new Error('A service token needs an `iss` (the calling service).');
  const iat = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: claims.iss,
      sub: claims.sub ?? null,
      role: claims.role ?? null,
      perms: claims.perms ?? [],
      reqId: claims.reqId ?? null,
      ...(claims.ctx && typeof claims.ctx === 'object' ? { ctx: claims.ctx } : {}),
      iat,
      exp: iat + ttlSec,
    }),
  ).toString('base64url');
  const body = `${HEADER}.${payload}`;
  return `${body}.${mac(body, secret)}`;
}

/** Returns the claims, or null for ANY problem (bad shape/signature/algorithm, expired, wrong issuer). */
export function verifyServiceToken(token, { secret, issuers, now = Date.now() } = {}) {
  try {
    needSecret(secret);
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    if (JSON.parse(Buffer.from(h, 'base64url').toString())?.alg !== 'HS256') return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(mac(`${h}.${p}`, secret));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof claims?.exp !== 'number' || claims.exp * 1000 <= now) return null;
    if (issuers && !issuers.includes(claims.iss)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function bearer(header) {
  const m = /^Bearer\s+(.+)$/i.exec(header || '');
  return m ? m[1].trim() : null;
}
