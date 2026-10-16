import { FALLBACK_ROLES } from '../../../lib/hooks/useRoleOptions.js';

/**
 * Only the picker's vocabulary for when the roles list cannot be read (DESIGN.md §21.1). Roles normally come from
 * GET /admin/roles (useRoleOptions); what a role may DO is decided by the server and nothing here names a role in a branch.
 */
export const ROLES = FALLBACK_ROLES;
export const roleLabel = (value, options = ROLES) => options.find((r) => r.value === value)?.label ?? value;

/** The operator-write refusals worth a sentence of their own (docs/ROLES.md §2). */
export function operatorError(e) {
  if (e?.code === 'escalation') {
    const list = e.body?.permissions || e.body?.offending || [];
    return `You can only give a role you hold the permissions of yourself.${list.length ? ` Missing for you: ${list.join(', ')}.` : ''}`;
  }
  if (e?.code === 'unknown_role') return 'That role no longer exists. Reload the page and choose another.';
  return e?.message || 'Something went wrong.';
}
