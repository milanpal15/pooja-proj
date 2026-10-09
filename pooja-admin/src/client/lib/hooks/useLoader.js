import { useCallback, useEffect, useRef, useState } from 'react';

import { Unauthorized } from '../../api.js';

/**
 * Load something, optionally keep it fresh, and say what state it is in.
 *
 *   status: 'loading'  nothing yet
 *           'ready'    have data, last fetch fine
 *           'stale'    have data, but the last refresh failed (keep showing it)
 *           'error'    never loaded
 *
 * `offline` is true when the failure was "nothing answered", so a screen can
 * say the API is down instead of showing a raw error.
 * A 401 is not an error here — the shell has already swapped in the login page.
 */
export function useLoader(fetcher, { deps = [], pollMs = 0, enabled = true } = {}) {
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const seq = useRef(0);
  const [state, setState] = useState({ data: null, status: 'loading', error: null, offline: false });

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await fetchRef.current();
      if (mine === seq.current) setState({ data, status: 'ready', error: null, offline: false });
      return data;
    } catch (e) {
      if (e instanceof Unauthorized || mine !== seq.current) return undefined;
      setState((s) => ({
        data: s.data,
        status: s.data ? 'stale' : 'error',
        error: e.message,
        offline: !!e.offline,
      }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    const id = pollMs ? setInterval(reload, pollMs) : null;
    return () => {
      seq.current += 1; // drop any answer still in flight
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollMs, reload, ...deps]);

  /** Patch the cached data without a round trip (optimistic updates). */
  const setData = useCallback((next) => {
    setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next }));
  }, []);

  return { ...state, reload, setData };
}
