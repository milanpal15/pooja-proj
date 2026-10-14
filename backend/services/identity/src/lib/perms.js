import { HttpError } from './http-error.js';

/** `edit` implies `view` — same rule as the monolith's access/permissions.js `hasPermission`. */
export function hasPermission(permissions, perm) {
  const held = Array.isArray(permissions) ? permissions : [];
  if (held.includes(perm)) return true;
  const [area, level] = perm.split(':');
  return level === 'view' && held.includes(`${area}:edit`);
}

export const can = (req, perm) => hasPermission(req.auth?.perms, perm);

/**
 * Defence in depth: the admin BFF already applies the area gate, but this service never trusts that
 * alone. Passes when the verified token's `perms` hold ANY of the listed permissions.
 */
export function requirePerm(...perms) {
  return (req, _res, next) => {
    if (perms.some((p) => can(req, p))) return next();
    next(new HttpError(403, 'forbidden', "You don't have permission for that.", { needs: perms[0] }));
  };
}

/**
 * Route families are bound to the BFF that authenticates their caller: devotee routes only trust `mobile-bff`
 * (it verified a Firebase token), operator routes only `admin-bff` (it verified the session cookie). A valid token
 * from any other issuer is refused 403 - ALLOWED_ISSUERS says who may talk to this service at all, this says who may
 * talk to THIS route.
 */
export function onlyFrom(...issuers) {
  return (req, _res, next) => {
    if (issuers.includes(req.auth?.iss)) return next();
    next(new HttpError(403, 'wrong_issuer', 'This route is not available to that caller.'));
  };
}

/** The devotee a mobile-BFF token vouches for, rebuilt as the `decoded` shape the sign-in logic reads. */
export function devoteeOf(req) {
  const uid = req.auth?.sub;
  if (!uid || typeof uid !== 'string') throw new HttpError(401, 'bad_subject', 'The token names no devotee.');
  const t = req.auth?.ctx?.tok ?? {};
  return {
    uid,
    phone_number: t.phone_number || undefined,
    email: t.email || undefined,
    email_verified: t.email_verified === true,
    picture: t.picture || undefined,
    name: t.name || undefined,
    firebase: { sign_in_provider: t.provider || undefined },
  };
}
