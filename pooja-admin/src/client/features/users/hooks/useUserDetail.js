import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

/**
 * One user's 360 (`GET /admin/users/:id`). Sections that could not be fetched arrive as `{ unavailable:true }`
 * inside an otherwise good answer, so a failure here means identity itself failed (or the user does not exist: 404).
 * `reload()` re-asks for everything — the endpoint has no per-section form — and keeps showing the old data meanwhile.
 */
export function useUserDetail(id) {
  const l = useLoader(() => api.users.get(id), { deps: [id] });
  return { detail: l.data, status: l.status, error: l.error, offline: l.offline, reload: l.reload, setDetail: l.setData };
}
