import { useEffect, useState } from 'react';

import { api } from '../../../api.js';

/**
 * Devotee search for the adjust form: debounced, and it drops answers that
 * arrive after a newer query was typed.
 * @returns {{ results, status: 'idle'|'searching'|'done'|'error' }}
 */
export function useWalletSearch(query) {
  const [state, setState] = useState({ results: [], status: 'idle' });

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setState({ results: [], status: 'idle' });
      return undefined;
    }
    let live = true;
    setState((s) => ({ ...s, status: 'searching' }));
    const t = setTimeout(async () => {
      try {
        const results = await api.wallets(q);
        if (live) setState({ results, status: 'done' });
      } catch {
        if (live) setState({ results: [], status: 'error' });
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  return state;
}
