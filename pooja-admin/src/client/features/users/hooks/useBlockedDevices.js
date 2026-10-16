import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

export function useBlockedDevices() {
  const l = useLoader(() => api.blockedDevices.list());
  return { devices: l.data ?? [], status: l.status, error: l.error, offline: l.offline, reload: l.reload };
}
