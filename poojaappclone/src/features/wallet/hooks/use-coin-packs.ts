import { useCallback, useEffect, useState } from 'react';

import { type CoinPack, fetchCoinPacks } from '@/lib/api';

export type PacksState = {
  packs: CoinPack[];
  coinsPerRupee: number;
  status: 'loading' | 'ready' | 'error';
  reload: () => void;
};

/** The public price list. Re-fetched on demand so the sale label is never stale. */
export function useCoinPacks(enabled = true): PacksState {
  const [packs, setPacks] = useState<CoinPack[]>([]);
  const [coinsPerRupee, setRate] = useState(1);
  const [status, setStatus] = useState<PacksState['status']>('loading');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchCoinPacks()
      .then((r) => {
        if (!alive) return;
        setPacks([...r.packs].sort((a, b) => a.order - b.order));
        setRate(r.coinsPerRupee);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [enabled, nonce]);

  const reload = useCallback(() => {
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    setNonce((n) => n + 1);
  }, []);
  return { packs, coinsPerRupee, status, reload };
}
