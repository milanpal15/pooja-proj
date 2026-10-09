/**
 * Roles and permissions — DESIGN.md §21. THE one place a role is defined.
 *
 * A permission is `"<area>:view"` or `"<area>:edit"`; `edit` implies `view`.
 * The dashboard never keeps its own copy: `GET /api/admin/session` returns
 * `permissions` and the UI derives everything from that list.
 */

export const AREAS = [
  'overview', 'content', 'horoscope', 'panchang', 'announcements', 'push', 'flags', 'policies',
  'devotees', 'astrologers', 'money', 'wallets', 'orders', 'calls', 'payouts', 'operators',
];

export const ROLES = ['admin', 'editor', 'viewer'];

/** Areas wholly withheld from editor and viewer (personal data, or reaches every device). */
const ADMIN_ONLY_AREAS = ['operators', 'devotees', 'push'];
/** Areas an editor may write. */
const EDITOR_EDITS = ['content', 'horoscope', 'panchang', 'announcements'];

const views = AREAS.filter((a) => !ADMIN_ONLY_AREAS.includes(a)).map((a) => `${a}:view`);

export const ROLE_PERMISSIONS = {
  admin: AREAS.flatMap((a) => [`${a}:view`, `${a}:edit`]),
  editor: [...views, ...EDITOR_EDITS.map((a) => `${a}:edit`)],
  viewer: [...views],
};

/** The permission strings a role holds (empty for an unknown role — fail closed). */
export function permissionsFor(role) {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/** Does `role` hold `area:level`? `edit` implies `view`. */
export function can(role, area, level = 'view') {
  const held = ROLE_PERMISSIONS[role];
  if (!held) return false;
  return held.includes(`${area}:${level}`) || (level === 'view' && held.includes(`${area}:edit`));
}

/** Same check against an already-materialised permission list. */
export function hasPermission(permissions, perm) {
  if (permissions.includes(perm)) return true;
  const [area, level] = perm.split(':');
  return level === 'view' && permissions.includes(`${area}:edit`);
}
