/**
 * Pure access helpers (DESIGN.md §21.6) — no React, so they are testable in
 * plain Node (scripts/check-access.mjs). The dashboard never decides what a
 * role may do: the server sends the permission list and everything here is
 * derived from it.
 *
 * A permission is "<area>:<level>", level `view` or `edit`; `edit` implies `view`.
 */

/**
 * Build the access object from the `/api/admin/session` answer.
 *  - no session / no permissions -> nothing is allowed (fail closed);
 *  - `required: false` (local dev with no operators) -> the API treats the
 *    caller as an admin, so everything is allowed.
 */
export function makeAccess(session) {
  const open = !!session && session.required === false;
  const granted = new Set(Array.isArray(session?.permissions) ? session.permissions : []);
  const can = (perm) => {
    if (open) return true;
    if (typeof perm !== 'string') return false;
    if (granted.has(perm)) return true;
    const [area, level] = perm.split(':');
    return level === 'view' && granted.has(`${area}:edit`);
  };
  return {
    role: session?.role ?? null,
    can,
    canView: (area) => can(`${area}:view`),
    canEdit: (area) => can(`${area}:edit`),
  };
}

/** A tab's area(s): one string, or a list for a tab that combines sections. */
const areasOf = (tab) => [].concat(tab?.area ?? []);

/** A tab is shown when at least one of its areas is viewable. No area = hidden. */
export const tabVisible = (tab, access) => areasOf(tab).some((a) => access.canView(a));

/** True when the account can look at the tab but change nothing in it. */
export const tabReadOnly = (tab, access) => !areasOf(tab).some((a) => access.canEdit(a));

export const visibleTabs = (tabs, access) => tabs.filter((t) => tabVisible(t, access));
