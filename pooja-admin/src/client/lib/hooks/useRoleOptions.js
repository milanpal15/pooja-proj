import { useMemo } from 'react';

import { api } from '../api/index.js';
import { useLoader } from './useLoader.js';

/** The three built-ins, used only until (or if) the roles list cannot be read. */
export const FALLBACK_ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Everything.' },
  { value: 'editor', label: 'Editor', desc: 'Edits content; views most other things.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only.' },
];

/**
 * Roles an operator can be given, from GET /admin/roles (names + descriptions; the permission list is omitted for
 * operators who may only view operators). `labelOf(key, roleName?)` prefers the server's name for a role key.
 */
export function useRoleOptions() {
  const q = useLoader(() => api.roles.list());
  const options = useMemo(() => {
    const list = q.data?.roles;
    if (!Array.isArray(list) || !list.length) return FALLBACK_ROLES;
    return list.map((r) => ({ value: r.key, label: r.name || r.key, desc: r.description || '', builtin: !!r.builtin }));
  }, [q.data]);
  const labelOf = (key, roleName) => roleName || options.find((o) => o.value === key)?.label || key;
  return { options, labelOf, loaded: q.status === 'ready' };
}
