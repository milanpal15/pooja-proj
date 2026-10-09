import { useMemo } from 'react';

import { api } from '../../../api.js';
import { useAccess } from '../../../lib/access/index.js';
import { idOf } from '../../../lib/ids.js';
import { useBillingRules } from '../../../lib/hooks/useBillingRules.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { liveCounts } from '../lib/presence.js';

const POLL_MS = 20000;

/**
 * Astrologers, refreshed every 20 s so Online / On a call stay true while the
 * tab is open (the poll stops when the tab unmounts).
 * @returns {{ data: { rows, counts, defaultSharePct }, status, error, offline, actions }}
 */
export function useAstrologers() {
  const list = useLoader(() => api.astrologers.list(), { pollMs: POLL_MS });
  // Only the default share for a NEW astrologer comes from the billing rules.
  const rules = useBillingRules({ enabled: useAccess().canView('money') });
  const rows = list.data || [];
  const counts = useMemo(() => liveCounts(rows), [rows]);

  const actions = {
    reload: list.reload,
    async save(id, body) {
      if (id) await api.astrologers.update(id, body);
      else await api.astrologers.create(body);
      await list.reload();
    },
    async remove(a) {
      await api.astrologers.remove(idOf(a));
      await list.reload();
    },
    async suspend(a) {
      await api.astrologers.suspend(idOf(a));
      await list.reload();
    },
    async reactivate(a) {
      await api.astrologers.reactivate(idOf(a));
      await list.reload();
    },
    /** Optimistic Listed switch, rolled back if the server refuses. */
    async setListed(a, listed) {
      const id = idOf(a);
      const patch = (v) => list.setData((xs) => xs.map((r) => (idOf(r) === id ? { ...r, listed: v } : r)));
      patch(listed);
      try {
        await api.astrologers.update(id, { listed });
      } catch (e) {
        patch(!listed);
        throw e;
      }
    },
  };

  return {
    data: { rows, counts, defaultSharePct: Number(rules.rules?.defaultSharePct ?? 30) },
    status: list.status,
    error: list.error,
    offline: list.offline,
    actions,
  };
}
