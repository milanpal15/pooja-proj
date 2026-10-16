import { useCallback } from 'react';

import { api } from '../../../lib/api/index.js';
import { KNOWN_AREAS } from '../../../lib/access/areas.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

/** The roles list plus the area registry the matrix is drawn from (the server's, falling back to the built-in table). */
export function useRoles() {
  const q = useLoader(() => api.roles.list());
  const roles = q.data?.roles || [];
  const areas = q.data?.areas?.length ? q.data.areas : KNOWN_AREAS;
  const reload = useCallback(() => q.reload(), [q.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  return { status: q.status, error: q.error, offline: q.offline, roles, areas, reload };
}
