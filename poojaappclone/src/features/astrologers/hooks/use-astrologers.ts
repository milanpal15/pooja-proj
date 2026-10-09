import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type Astrologer, fetchAstrologers } from '@/lib/api';

const REFRESH_MS = 15_000;

/**
 * The public astrologer list, refetched every 15 s while the screen is
 * focused and the app is in the foreground. A failed refresh keeps the last
 * good list and sets `stale`; `error` is only true when there is nothing to show.
 */
export function useAstrologers() {
  const [astrologers, setAstrologers] = useState<Astrologer[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchAstrologers();
      if (!alive.current) return;
      setLoadedOnce(true);
      setAstrologers(list);
      setFailed(false);
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const id = setInterval(() => {
        if (AppState.currentState === 'active') refresh();
      }, REFRESH_MS);
      return () => clearInterval(id);
    }, [refresh]),
  );

  return {
    astrologers,
    loading,
    refresh,
    /** Nothing loaded and the last attempt failed. */
    error: failed && !loadedOnce,
    /** Showing an older list because the latest refresh failed. */
    stale: failed && loadedOnce,
    onlineCount: astrologers.filter((a) => a.presence === 'online').length,
  };
}
