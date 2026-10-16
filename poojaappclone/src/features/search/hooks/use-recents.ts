import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addRecent, parseRecents, removeRecent } from '../lib/recents';

const KEY = 'search.recents.v1';

/** The device's recent searches (max 8). Storage failures just mean no history. */
export function useRecents() {
  const [recents, setRecents] = useState<string[]>([]);
  const latest = useRef<string[]>([]);

  const commit = useCallback((next: string[]) => {
    latest.current = next;
    setRecents(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive) return;
        // A save made before the read finished must survive it.
        const merged = latest.current.length ? latest.current : parseRecents(raw);
        latest.current = merged;
        setRecents(merged);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const add = useCallback((q: string) => commit(addRecent(latest.current, q)), [commit]);
  const remove = useCallback((q: string) => commit(removeRecent(latest.current, q)), [commit]);
  const clear = useCallback(() => commit([]), [commit]);
  return { recents, add, remove, clear };
}
