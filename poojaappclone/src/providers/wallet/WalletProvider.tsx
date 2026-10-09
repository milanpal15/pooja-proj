import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/providers/auth';
import { fetchWallet } from '@/lib/api';

type WalletValue = {
  /** Coins the devotee can spend. `null` until the first read succeeds (or when signed out). */
  balance: number | null;
  loading: boolean;
  /** Re-read the balance. Never throws: a failure keeps the last known figure. */
  refresh: () => Promise<void>;
  /**
   * Adopt a balance the server just returned with a purchase/spend/refund.
   * Those responses carry the authoritative figure, so showing it directly
   * avoids a second round trip and a flash of the stale one.
   */
  setBalance: (balance: number) => void;
};

const WalletContext = createContext<WalletValue>({
  balance: null,
  loading: false,
  refresh: async () => {},
  setBalance: () => {},
});

/**
 * The devotee's coin balance, app-wide.
 *
 * Only fetched while signed in. It refreshes when the app returns to the
 * foreground (a purchase may have completed through the webhook while the app
 * was away) and whenever a screen reports a spend or purchase via
 * `setBalance`/`refresh`. The server owns the number; this is a cache of it.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // The balance is remembered WITH the uid it belongs to, so signing out and
  // into another account can never show the previous devotee's coins — the
  // stale figure is simply not exposed, with no reset effect needed.
  const [entry, setEntry] = useState<{ uid: string; value: number } | null>(null);
  const [loading, setLoading] = useState(false);
  // A slow response for an old request must not overwrite a newer balance.
  const seq = useRef(0);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  const refresh = useCallback(async () => {
    const who = uidRef.current;
    if (!who) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const value = await fetchWallet();
      if (mine === seq.current) setEntry({ uid: who, value });
    } catch {
      // Offline or a blip: keep what we had. The balance is shown, not
      // trusted — every spend is re-checked by the server.
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const setBalance = useCallback((value: number) => {
    const who = uidRef.current;
    if (!who) return;
    seq.current++; // invalidate any in-flight read
    setEntry({ uid: who, value });
    setLoading(false);
  }, []);

  useEffect(() => {
    // uidRef is synced by the effect above (declared first, so it runs first).
    if (uid) refresh();
    else seq.current++;
  }, [uid, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const balance = entry && entry.uid === uid ? entry.value : null;
  const value = useMemo(
    () => ({ balance, loading, refresh, setBalance }),
    [balance, loading, refresh, setBalance],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  return useContext(WalletContext);
}
