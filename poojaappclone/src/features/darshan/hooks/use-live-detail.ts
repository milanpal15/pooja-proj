import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, fetchLiveStream, type LiveDetail } from '@/lib/api';

/** One stream. `missing` = the API said 404 (disabled or gone); `failed` = unreachable. */
export function useLiveDetail(slug: string) {
  const [stream, setStream] = useState<LiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    fetchLiveStream(slug)
      .then((s) => {
        if (!alive) return;
        setStream(s);
        setFailed(false);
        setMissing(false);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  useFocusEffect(load);
  return { stream, loading, failed, missing, reload: () => void load() };
}
