import { useCallback, useEffect, useRef, useState } from 'react';

import { type CallRow, fetchMyCalls } from '@/lib/api';

/** The astrologer's call history, newest first, paged by `before=<startedAt>`. */
export function useMyCalls(pageSize = 20) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const loadingMore = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchMyCalls(pageSize);
      setCalls(rows);
      setMore(rows.length >= pageSize);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    const id = setTimeout(refresh, 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const loadMore = useCallback(async () => {
    const last = calls[calls.length - 1];
    if (!last || loadingMore.current || !more) return;
    loadingMore.current = true;
    try {
      const rows = await fetchMyCalls(pageSize, last.startedAt);
      setCalls((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      setMore(rows.length >= pageSize);
    } catch {
      // leave the button to retry
    } finally {
      loadingMore.current = false;
    }
  }, [calls, more, pageSize]);

  return { calls, loading, error, more, refresh, loadMore };
}
