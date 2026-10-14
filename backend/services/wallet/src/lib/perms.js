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
 * A valid token from the wrong kind of caller is as good as none: the phone BFF cannot act as an operator, the admin BFF cannot
 * spend a devotee's coins, and nothing but the order-side services may move the ledger.
 */
const LEDGER = ['monolith', 'pooja-api', 'orders', 'calls'];
const EDGES = [
  { re: /^\/(debit|credit|refund|txn|balance|reconcile)(\/|$)/, from: LEDGER },
  { re: /^\/wallet(\/|$)/, from: ['mobile-bff'] },
  { re: /^\/(coins\/packs|webhooks\/razorpay)$/, from: ['mobile-bff', 'admin-bff'] },
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
 * `<area>:view|edit`, read from the signed token's `perms` (money-affecting writes keep exactly the roles the monolith enforces:
 * pack/billing writes `money:edit`, an adjustment `wallets:edit`, the wallet search also `devotees:view`). Also publishes `req.can` /
 * `req.operator` for the code written against the monolith's session.
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

/** The devotee routes: the verified uid rides in the token's `sub`. Shaped like the monolith's `requireAuth`. */
export function requireDevotee(req, _res, next) {
  if (!req.auth?.sub || typeof req.auth.sub !== 'string') return next(new HttpError(401, 'unauthorized', 'missing bearer token'));
  req.token = { uid: req.auth.sub };
  next();
}
