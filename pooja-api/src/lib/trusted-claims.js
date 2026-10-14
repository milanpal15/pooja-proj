import { config } from '../config/env.js';
import { bearer, verifyServiceToken } from './service-jwt.js';

/**
 * Who vouched for this request? (phase 2, IDENTITY_URL set)
 *
 * The BFFs authenticate the end user (Firebase ID token / operator cookie) and call the monolith with a short-lived
 * service JWT. The monolith trusts ONLY a token signed with INTERNAL_JWT_SECRET, and ONLY from the BFF that owns
 * that route family: devotee routes from `mobile-bff`, operator routes from `admin-bff`. A token from the other BFF
 * is as good as none - a phone that reaches the admin BFF cannot act as an operator, and the reverse.
 */
export const DEVOTEE_ISSUER = 'mobile-bff';
export const OPERATOR_ISSUER = 'admin-bff';

/** The verified claims of the request's service token, or null (absent, malformed, expired, wrong issuer). */
export function trustedClaims(req, issuer) {
  const secret = config.internalJwtSecret;
  if (!secret) return null;
  return verifyServiceToken(bearer(req.headers?.authorization ?? req.get?.('authorization')), { secret, issuers: [issuer] });
}

export const hasBearer = (req) => /^Bearer\s+\S/i.test(req.headers?.authorization ?? '');
