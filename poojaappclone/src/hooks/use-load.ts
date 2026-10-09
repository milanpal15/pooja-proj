import { useCallback, useEffect, useState } from 'react';

export type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Run an async read and expose `{data, status, reload}`.
 *
 * `load` MUST be memoised (useCallback) — a new function means a new request,
 * which is how a filter change refetches. Stale data is kept while the next
 * request is in flight or if it fails, so a list never blanks on a blip; the
 * screen decides whether `status:'error'` with data is worth a banner.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; status: LoadStatus }>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => alive && setState({ data, status: 'ready' }))
      .catch(() => alive && setState((s) => ({ data: s.data, status: 'error' })));
    return () => {
      alive = false;
    };
  }, [load, nonce]);

  const reload = useCallback(() => {
    setState((s) => (s.data === undefined ? { status: 'loading' } : s));
    setNonce((n) => n + 1);
  }, []);

  return { ...state, reload };
}
