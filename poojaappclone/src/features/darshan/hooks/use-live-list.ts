import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchLive, type LiveList } from '@/lib/api';

export type LiveListState = {
  data: LiveList | null;
  loading: boolean;
  /** The API could not be reached (or answered badly) and there is nothing cached to show. */
  failed: boolean;
  reload: () => void;
};

/** `/api/live`, refreshed each time the screen is focused (live status changes by the minute). */
export function useLiveList(): LiveListState {
  const [data, setData] = useState<LiveList | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    fetchLive()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(load);
  return { data, loading, failed, reload: () => void load() };
}

/** True only when the API says some stream is live; false while loading or unreachable. */
export function useAnyLive(): boolean {
  const { data } = useLiveList();
  return !!data?.streams.some((s) => s.state === 'live');
}
