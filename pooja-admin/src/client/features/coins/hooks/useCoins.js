import { useMemo } from 'react';

import { api } from '../../../api.js';
import { idOf } from '../../../lib/ids.js';
import { useBillingRules } from '../../../lib/hooks/useBillingRules.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { soldByPack } from '../lib/packs.js';

/**
 * Everything the Coins tab shows above the transactions: packs (the one that
 * must load), plus stats, 30-day orders and the billing rules, which are soft —
 * if one fails its cells read "—" and the packs are still editable.
 *
 * @returns {{ data: { packs, stats, coinsPerRupee, sold }, status, error, offline, actions }}
 */
export function useCoins({ enabled = true } = {}) {
  const on = { enabled };
  const packs = useLoader(() => api.coinPacks.list(), on);
  const stats = useLoader(() => api.coinStats(30), on);
  const orders = useLoader(() => api.coinOrders(500), on);
  const rules = useBillingRules(on);

  const rows = useMemo(
    () => (packs.data || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [packs.data],
  );
  const coinsPerRupee = Number(rules.rules?.coinsPerRupee) > 0 ? Number(rules.rules.coinsPerRupee) : 1;
  const sold = useMemo(() => (orders.data ? soldByPack(rows, orders.data) : null), [rows, orders.data]);

  const refresh = () => Promise.all([packs.reload(), stats.reload()]);

  const actions = {
    reload: refresh,
    async savePack(id, body) {
      if (id) await api.coinPacks.update(id, body);
      else await api.coinPacks.create(body);
      await refresh();
    },
    async removePack(pack) {
      await api.coinPacks.remove(idOf(pack));
      await refresh();
    },
    /** Optimistic: flip now, put it back if the server says no. */
    async setActive(pack, active) {
      const id = idOf(pack);
      const patch = (v) => packs.setData((xs) => xs.map((p) => (idOf(p) === id ? { ...p, active: v } : p)));
      patch(active);
      try {
        await api.coinPacks.update(id, { active });
      } catch (e) {
        patch(!active);
        throw e;
      }
    },
  };

  return {
    data: { packs: rows, stats: stats.data, statsLoading: stats.status === 'loading', coinsPerRupee, sold },
    status: packs.status,
    error: packs.error,
    offline: packs.offline,
    actions,
  };
}
