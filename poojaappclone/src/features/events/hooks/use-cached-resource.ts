import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { ApiError } from '@/lib/api';

import { parseCache } from '../lib/events-logic';

export type Resource<T> = {
  data: T | null;
  loading: boolean;
  /** The API could not be reached (or answered badly) and there is nothing cached to show. */
  failed: boolean;
  /** `data` is the last saved copy because the API could not be reached just now. */
  stale: boolean;
  /** The API answered 404 (unpublished or gone). */
  missing: boolean;
  reload: () => void;
  /** Replace the data with what an action just returned (a join, a progress report) and keep the cache in step. */
  mutate: (fn: (current: T) => T) => void;
};

/**
 * Stale-while-revalidate for a read-only resource: show what was cached at once, refresh on every
 * focus (status changes by the minute), and keep the cached copy when the network fails. Join and
 * progress are NOT cached (they need the network); only reads are.
 */
export function useCachedResource<T>(storageKey: string, fetcher: () => Promise<T>, valid: (v: unknown) => boolean): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);
  const [missing, setMissing] = useState(false);
  const dataRef = useRef<T | null>(null);

  const load = useCallback(() => {
    let alive = true;
    let have = false;

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        const hit = parseCache<T>(raw, valid);
        if (alive && hit && !have) {
          have = true;
          dataRef.current = hit;
          setData(hit);
          setLoading(false);
        }
      })
      .catch(() => {});

    fetcher()
      .then((fresh) => {
        if (!alive) return;
        have = true;
        dataRef.current = fresh;
        setData(fresh);
        setStale(false);
        setFailed(false);
        setMissing(false);
        AsyncStorage.setItem(storageKey, JSON.stringify(fresh)).catch(() => {});
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) {
          setMissing(true);
          dataRef.current = null;
          setData(null);
          AsyncStorage.removeItem(storageKey).catch(() => {});
          return;
        }
        // Give the cache read a moment to land before declaring failure.
        setTimeout(() => {
          if (!alive) return;
          if (have) setStale(true);
          else setFailed(true);
        }, 150);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // fetcher/valid are stable per screen; the key identifies the resource.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const mutate = useCallback(
    (fn: (current: T) => T) => {
      const cur = dataRef.current;
      if (!cur) return;
      const next = fn(cur);
      dataRef.current = next;
      setData(next);
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
    },
    [storageKey],
  );

  useFocusEffect(load);
  return { data, loading, failed, stale, missing, reload: () => void load(), mutate };
}
