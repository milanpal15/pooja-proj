import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { Unauthorized } from '../../../lib/api/client.js';

const PAGE = 50;

/**
 * One event's participants, a page at a time (cursor pagination).
 *   status: 'loading' (first page) | 'ready' | 'error' (first page failed)
 * A failed "Load more" keeps the rows and sets `moreError`.
 * Names and contacts arrive already masked; nothing here unmasks them.
 */
export function useParticipants(eventId) {
  const [s, setS] = useState({ items: [], next: null, status: 'loading', error: '', offline: false, moreError: '', loadingMore: false });
  const seq = useRef(0);
  const nextRef = useRef(null);
  nextRef.current = s.next;

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    if (!eventId) return;
    setS({ items: [], next: null, status: 'loading', error: '', offline: false, moreError: '', loadingMore: false });
    try {
      const r = await api.events.participants(eventId, { limit: PAGE });
      if (mine === seq.current) setS((x) => ({ ...x, items: r.items, next: r.next, status: 'ready' }));
    } catch (e) {
      if (e instanceof Unauthorized || mine !== seq.current) return;
      setS((x) => ({ ...x, status: 'error', error: e.message, offline: !!e.offline }));
    }
  }, [eventId]);

  useEffect(() => {
    reload();
    return () => { seq.current += 1; };
  }, [reload]);

  const loadMore = useCallback(async () => {
    const cursor = nextRef.current;
    if (!cursor || !eventId) return;
    const mine = seq.current;
    setS((x) => ({ ...x, loadingMore: true, moreError: '' }));
    try {
      const r = await api.events.participants(eventId, { cursor, limit: PAGE });
      if (mine === seq.current) setS((x) => ({ ...x, items: [...x.items, ...r.items], next: r.next, loadingMore: false }));
    } catch (e) {
      if (e instanceof Unauthorized || mine !== seq.current) return;
      setS((x) => ({ ...x, loadingMore: false, moreError: e.message }));
    }
  }, [eventId]);

  return { ...s, reload, loadMore };
}
