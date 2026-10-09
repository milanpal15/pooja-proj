import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';

const listOf = (r) => (Array.isArray(r) ? r : r?.streams ?? []);

/** The streams (refreshed each minute, like the API's probe) and the writes made from the table. */
export function useStreams() {
  const toast = useToast();
  const list = useLoader(async () => listOf(await api.liveStreams.list()), { pollMs: 60000 });
  const streams = (list.data || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const toggle = async (s) => {
    const next = s.enabled === false;
    list.setData((rows) => rows.map((r) => (idOf(r) === idOf(s) ? { ...r, enabled: next } : r)));
    try {
      await api.liveStreams.update(idOf(s), { enabled: next });
      list.reload();
    } catch (e) {
      toast.error(`Could not change that. ${e.message}`);
      await list.reload();
    }
  };
  const remove = async (s) => {
    try {
      await api.liveStreams.remove(idOf(s));
    } catch (e) {
      toast.error(`Could not delete. ${e.message}`);
      return false;
    }
    toast.success('Stream deleted');
    await list.reload();
    return true;
  };
  return { streams, status: list.status, error: list.error, offline: list.offline, reload: list.reload, toggle, remove };
}
