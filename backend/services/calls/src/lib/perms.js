import { areaFor } from '@bhakti/common';

import { HttpError } from './http-error.js';

/** `edit` implies `view` (same rule as the monolith's access/permissions.js `hasPermission`). */
export function hasPermission(permissions, perm) {
  const held = Array.isArray(permissions) ? permissions : [];
  if (held.includes(perm)) return true;
  const [area, level] = perm.split(':');
  return level === 'view' && held.includes(`${area}:edit`);
}

const FORBIDDEN = "You don't have permission for that.";

/**
 * Route families -> the only callers (JWT `iss`) allowed to use them; first match wins, the last row refuses everyone.
 * A valid token from the wrong kind of caller is as good as none: the phone BFF cannot act as an operator, the admin BFF cannot place a call
 * on a devotee's behalf, and ONLY identity may ask who an astrologer is (the sign-in claim).
 */
const EDGES = [
  { re: /^\/directory\/astrologers\/(claim|active)$/, from: ['identity'] },
  // The public astrologer list / profile: either BFF serves it (the dashboard's smoke test reads it too).
  { re: /^\/astrologers(\/[^/]+)?$/, from: ['mobile-bff', 'admin-bff'] },
  { re: /^\/(calls|astrologer\/me)(\/|$)/, from: ['mobile-bff'] },
  { re: /^\/admin(\/|$)/, from: ['admin-bff'] },
  { re: /./, from: [] },
];

export function callerGate(req, _res, next) {
  const edge = EDGES.find((e) => e.re.test(req.path));
  if (edge.from.includes(req.auth?.iss)) return next();
  next(new HttpError(403, 'wrong_issuer', `Callers of type "${req.auth?.iss}" may not use this route.`));
}

export const ADMIN_PREFIX = /^\/admin(\/|$)/;

/**
 * The operator area gate for `/admin/...`, defence in depth behind the admin BFF's own: path -> area (unmapped = admin-only) ->
 * `<area>:view|edit`, read from the signed token's `perms` (astrologers / calls / payouts are areas of their own: an editor and a viewer read them,
 * only an admin writes them). Also publishes `req.can` / `req.operator` for the code written against the monolith's session.
 */
export function operatorGate(req, _res, next) {
  if (!ADMIN_PREFIX.test(req.path)) return next();
  const perms = req.auth?.perms;
  req.can = (perm) => hasPermission(perms, perm);
  req.operator = { id: req.auth?.sub ?? null, username: req.auth?.ctx?.username ?? String(req.auth?.sub ?? 'unknown'), role: req.auth?.role, permissions: perms };
  if (!req.auth?.sub || !Array.isArray(perms)) return next(new HttpError(401, 'unauthorized', 'Sign in required'));
  const { area, level, also } = areaFor(req.method, req.path);
  const needsPerm = `${area}:${level}`;
  if (!req.can(needsPerm)) return next(new HttpError(403, 'forbidden', FORBIDDEN, { needs: needsPerm }));
  if (also && !req.can(also)) return next(new HttpError(403, 'forbidden', FORBIDDEN, { needs: also }));
  next();
}

/**
 * The devotee (and astrologer) routes: the verified uid rides in the token's `sub`, the profile name the edge already knew in `ctx.name`.
 * Shaped like the monolith's `requireAuth` (`req.token.uid`, `req.user.name`). The ROLE is never read from the token: an astrologer
 * route also runs `requireAstrologer`, which looks the uid up in this service's own astrologers.
 */
export function requireDevotee(req, _res, next) {
  if (!req.auth?.sub || typeof req.auth.sub !== 'string') return next(new HttpError(401, 'unauthorized', 'missing bearer token'));
  req.token = { uid: req.auth.sub };
  req.user = { uid: req.auth.sub, name: typeof req.auth.ctx?.name === 'string' ? req.auth.ctx.name : undefined };
  next();
}
