/**
 * Service-to-service tokens: HS256 JWTs signed with INTERNAL_JWT_SECRET.
 * Claims: { iss, sub, role, perms, reqId, [ctx], iat, exp }. Expiry is 60 s by default.
 * `ctx` (optional object) carries facts the edge already verified - a devotee's profile name, an operator's username -
 * so a downstream service need not call identity again. It is part of the signed payload; absent = key omitted.
 * Pure node:crypto — no dependency.
 */
import crypto from 'node:crypto';

import { AuthError } from './errors.js';

export const DEFAULT_TTL_SEC = 60;
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

const mac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function needSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new AuthError('not_configured', 'INTERNAL_JWT_SECRET is missing or shorter than 16 characters.');
  }
}

/** @param {{iss:string, sub?:string, role?:string, perms?:string[], reqId?:string, ctx?:object}} claims */
export function signServiceToken(claims, { secret, ttlSec = DEFAULT_TTL_SEC, now = Date.now() } = {}) {
  needSecret(secret);
  if (!claims?.iss) throw new AuthError('malformed_token', 'A service token needs an `iss` (the calling service).');
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

/**
 * Verifies signature, algorithm, expiry and (optionally) issuer. Returns the claims.
 * @throws {AuthError} with a specific `.code`
 */
export function verifyServiceToken(token, { secret, issuers, now = Date.now() } = {}) {
  needSecret(secret);
  if (!token || typeof token !== 'string') throw new AuthError('missing_token', 'Missing service token.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('malformed_token', 'Malformed service token.');
  const [h, p, sig] = parts;

  let header;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString());
  } catch {
    throw new AuthError('malformed_token', 'Malformed service token header.');
  }
  if (header?.alg !== 'HS256') throw new AuthError('malformed_token', 'Unsupported token algorithm.');

  const a = Buffer.from(sig);
  const b = Buffer.from(mac(`${h}.${p}`, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AuthError('bad_signature', 'Service token signature does not match.');
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    throw new AuthError('malformed_token', 'Malformed service token payload.');
  }
  if (typeof claims?.exp !== 'number' || claims.exp * 1000 <= now) {
    throw new AuthError('token_expired', 'Service token has expired.');
  }
  if (issuers && !issuers.includes(claims.iss)) {
    throw new AuthError('wrong_issuer', `Service token issuer "${claims.iss}" is not allowed.`);
  }
  return claims;
}

/** Pull the token out of an `Authorization: Bearer …` header value. */
export function bearer(header) {
  const m = /^Bearer\s+(.+)$/i.exec(header || '');
  return m ? m[1].trim() : null;
}
