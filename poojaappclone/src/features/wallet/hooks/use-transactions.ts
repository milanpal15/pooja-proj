import { useCallback, useEffect, useState } from 'react';

import { fetchTransactions, type WalletTxn } from '@/lib/api';

export type TransactionsState = {
  transactions: WalletTxn[];
  status: 'loading' | 'ready' | 'error';
  reload: () => void;
};

/** Wallet history. Pass a changing `refreshKey` (the balance) to re-read after a spend. */
export function useTransactions(refreshKey?: unknown): TransactionsState {
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [status, setStatus] = useState<TransactionsState['status']>('loading');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchTransactions()
      .then((rows) => {
        if (!alive) return;
        setTransactions(rows);
        setStatus('ready');
      })
      .catch(() => alive && setStatus((s) => (s === 'ready' ? s : 'error')));
    return () => {
      alive = false;
    };
  }, [nonce, refreshKey]);

  const reload = useCallback(() => {
    setStatus('loading');
    setNonce((n) => n + 1);
  }, []);
  return { transactions, status, reload };
}
