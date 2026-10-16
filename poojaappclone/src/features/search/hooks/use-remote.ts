import { useEffect, useState } from 'react';

export type Remote<T> = { data: T | undefined; loading: boolean; failed: boolean };

/**
 * Fetch once (when `enabled`) and keep the answer. A failure leaves `data` undefined and
 * `failed` true; the other sections are unaffected.
 */
export function useRemoteOnce<T>(load: () => Promise<T>, enabled: boolean): Remote<T> {
  const [state, setState] = useState<{ data?: T; failed: boolean; done: boolean }>({ failed: false, done: false });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load().then(
      (data) => alive && setState({ data, failed: false, done: true }),
      () => alive && setState({ failed: true, done: true }),
    );
    return () => {
      alive = false;
    };
    // `load` is a module-level function; fetch once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return { data: state.data, loading: enabled && !state.done, failed: state.failed };
}

/**
 * Fetch an answer per query. Only the answer to the CURRENT query is ever returned: an older,
 * slower request resolves into a stale effect and is dropped, so it can never overwrite a newer one.
 */
export function useRemoteQuery<T>(query: string, load: (q: string) => Promise<T>, enabled: boolean): Remote<T> {
  const [state, setState] = useState<{ q: string; data?: T; failed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !query) return;
    let alive = true;
    load(query).then(
      (data) => alive && setState({ q: query, data, failed: false }),
      () => alive && setState({ q: query, failed: true }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, enabled]);
  if (!enabled || !query) return { data: undefined, loading: false, failed: false };
  const mine = state && state.q === query ? state : null;
  return { data: mine?.data, loading: !mine, failed: !!mine?.failed };
}
