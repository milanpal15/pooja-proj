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
