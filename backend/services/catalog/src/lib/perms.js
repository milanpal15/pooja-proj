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

/** Route families -> the only callers (JWT `iss`) allowed to use them; first match wins, the last row is the default. */
const EDGES = [
  { re: /^\/media\//, from: ['mobile-bff', 'admin-bff'] },
  { re: /^\/pricing\//, from: ['monolith', 'pooja-api', 'orders'] },
  { method: 'POST', re: /^\/live\/[^/]+\/jai$/, from: ['mobile-bff'] },
  { re: /^\/(content|admin|horoscope\/day)(\/|$)/, from: ['admin-bff'] },
  { re: /./, from: ['mobile-bff', 'admin-bff', 'monolith', 'pooja-api'] },
];

/** A valid token from the wrong kind of caller is as good as none (phone BFF cannot act as an operator, and so on). */
export function callerGate(req, _res, next) {
  const edge = EDGES.find((e) => (!e.method || e.method === req.method) && e.re.test(req.path));
  if (edge.from.includes(req.auth?.iss)) return next();
  next(new HttpError(403, 'wrong_issuer', `Callers of type "${req.auth?.iss}" may not use this route.`));
}

export const ADMIN_PREFIX = /^\/(content|admin|horoscope\/day)(\/|$)/;

/**
 * The operator area gate, applied here as defence in depth (the admin BFF already applied it): path -> area (unmapped =
 * admin-only) -> `<area>:view|edit`, read from the signed token's `perms`. Also publishes `req.can` / `req.operator` for
 * the module code that was written against the monolith's session.
 */
export function operatorGate(req, _res, next) {
  if (!ADMIN_PREFIX.test(req.path)) return next();
  const perms = req.auth?.perms;
  req.can = (perm) => hasPermission(perms, perm);
  req.operator = { id: req.auth?.sub ?? null, username: req.auth?.ctx?.username ?? String(req.auth?.sub ?? 'unknown'), role: req.auth?.role, permissions: perms };
  if (!req.auth?.sub || !Array.isArray(perms)) return next(new HttpError(401, 'unauthorized', 'Sign in required'));
  const { area, level, also } = areaFor(req.method, req.path);
  const needs = `${area}:${level}`;
  if (!req.can(needs)) return next(new HttpError(403, 'forbidden', FORBIDDEN, { needs }));
  if (also && !req.can(also)) return next(new HttpError(403, 'forbidden', FORBIDDEN, { needs: also }));
  next();
}

/** The devotee routes (Jai): the verified uid rides in the token's `sub`. Shaped like the monolith's `requireAuth`. */
export function requireDevotee(req, _res, next) {
  if (!req.auth?.sub) return next(new HttpError(401, 'unauthorized', 'missing bearer token'));
  req.token = { uid: String(req.auth.sub) };
  next();
}
