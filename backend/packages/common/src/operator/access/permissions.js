// COPIED from pooja-api/src/access/permissions.js (the admin BFF owns the area gate for the routes it serves).
// access-parity.test.mjs fails when the two drift - EXCEPT the areas that exist only here: `events`, `releases`, `approvals`, `audit`, `roles` (pooja-api never gets them). Move, do not fork, when the identity phase lands.
/**
 * Roles and permissions — DESIGN.md §21. THE one place a role is defined.
 *
 * A permission is `"<area>:view"` or `"<area>:edit"`; `edit` implies `view`.
 * The dashboard never keeps its own copy: `GET /api/admin/session` returns
 * `permissions` and the UI derives everything from that list.
 */

/**
 * The registry of areas: ONE list, with what the roles matrix and the sidebar need (docs/ROLES.md section 1). `group` is the sidebar group.
 * `AREAS` (just the keys) is derived from it. The first 17 keys are the monolith's (parity-tested); `events`, `releases`, `approvals`, `audit`
 * and `roles` exist only here (pooja-api never gets them) and are exempt in access-parity.test.mjs.
 */
export const AREA_INFO = [
  { key: 'overview', label: 'Overview', description: 'The dashboard overview, visitors and usage numbers.', group: 'Overview' },
  { key: 'content', label: 'Content', description: 'Deities, temples, aartis, poojas, Home layout, live darshan and other app content.', group: 'Content' },
  { key: 'horoscope', label: 'Horoscope', description: 'The daily reading for each sign.', group: 'Content' },
  { key: 'panchang', label: 'Panchang', description: 'The daily panchang.', group: 'Content' },
  { key: 'announcements', label: 'Announcements', description: 'The in-app announcement shown to devotees.', group: 'People' },
  { key: 'push', label: 'Push notifications', description: 'Sending a notification to every phone.', group: 'People' },
  { key: 'flags', label: 'Feature flags', description: 'Switching app features on and off.', group: 'Releases & control' },
  { key: 'policies', label: 'Policies', description: 'Terms and other legal text.', group: 'Admin' },
  { key: 'devotees', label: 'Devotees', description: 'Devotee accounts, names and phone numbers.', group: 'People' },
  { key: 'astrologers', label: 'Astrologers', description: 'Astrologer profiles and sign-in invitations.', group: 'Commerce' },
  { key: 'money', label: 'Coin packs & billing', description: 'Coin packs, prices and billing rules.', group: 'Commerce' },
  { key: 'wallets', label: 'Wallets', description: 'Devotee coin balances and adjustments.', group: 'Commerce' },
  { key: 'orders', label: 'Bookings & reviews', description: 'Pooja bookings, chadhava orders and reviews.', group: 'Commerce' },
  { key: 'calls', label: 'Calls', description: 'Astrologer calls and their refunds.', group: 'Commerce' },
  { key: 'payouts', label: 'Payouts', description: 'Astrologer payouts.', group: 'Commerce' },
  { key: 'operators', label: 'Operators', description: 'Dashboard logins and which role each holds.', group: 'Admin' },
  { key: 'events', label: 'Events', description: 'Festival events, their tasks and rewards.', group: 'Content' },
  { key: 'releases', label: 'App releases', description: 'App versions, the minimum and blocked builds, maintenance mode.', group: 'Releases & control' },
  { key: 'approvals', label: 'Approvals', description: 'Second-person approval of risky changes.', group: 'Admin' },
  { key: 'audit', label: 'Audit log', description: 'Who changed what, and when.', group: 'Insights' },
  { key: 'roles', label: 'Roles & permissions', description: 'Creating roles and choosing what each may see and edit.', group: 'Admin' },
];

export const AREAS = AREA_INFO.map((a) => a.key);

/** The three code-defined roles (presets). Their permissions are ROLE_PERMISSIONS; they cannot be edited or deleted. */
export const ROLES = ['admin', 'editor', 'viewer'];

export const BUILTIN_ROLES = [
  { key: 'admin', name: 'Administrator', description: 'Full access, including operators, roles, approvals and the audit log.' },
  { key: 'editor', name: 'Editor', description: 'Edits content, horoscope, panchang, announcements and events; can look at everything else except personal data.' },
  { key: 'viewer', name: 'Viewer', description: 'Read-only everywhere except personal data.' },
];

/** Areas wholly withheld from editor and viewer (personal data, reaches every device, or governs the dashboard itself). */
const ADMIN_ONLY_AREAS = ['operators', 'devotees', 'push', 'audit', 'roles'];
/** Areas an editor may write. */
const EDITOR_EDITS = ['content', 'horoscope', 'panchang', 'announcements', 'events'];

const views = AREAS.filter((a) => !ADMIN_ONLY_AREAS.includes(a)).map((a) => `${a}:view`);

export const ROLE_PERMISSIONS = {
  admin: AREAS.flatMap((a) => [`${a}:view`, `${a}:edit`]),
  editor: [...views, ...EDITOR_EDITS.map((a) => `${a}:edit`)],
  viewer: [...views],
};

const PERM_RE = /^([a-z]+):(view|edit)$/;

/**
 * Normalise a custom role's permission list: unknown / malformed strings are returned in `invalid`; `edit` implies `view`
 * (both are stored); duplicates collapse; the order is the registry's (view before edit).
 * @returns {{ permissions: string[], invalid: string[] }}
 */
export function normalizePermissions(list) {
  const invalid = [];
  const held = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    const m = typeof p === 'string' ? PERM_RE.exec(p) : null;
    if (!m || !AREAS.includes(m[1])) {
      invalid.push(typeof p === 'string' ? p.slice(0, 60) : String(typeof p));
      continue;
    }
    held.add(`${m[1]}:view`);
    if (m[2] === 'edit') held.add(`${m[1]}:edit`);
  }
  return { permissions: AREAS.flatMap((a) => [`${a}:view`, `${a}:edit`]).filter((p) => held.has(p)), invalid };
}

/** The permissions in `wanted` that `held` does not cover (`edit` implies `view`) - the privilege-escalation check. */
export function missingPermissions(held, wanted) {
  const have = Array.isArray(held) ? held : [];
  return (Array.isArray(wanted) ? wanted : []).filter((p) => !hasPermission(have, p));
}

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
