import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Unauthorized, api } from '../../../lib/api/index.js';
import { useDebounced } from '../../../lib/hooks/useDebounced.js';
import { PAGE_SIZE, buildListQuery, emptyPage, mergePage } from '../lib/query.js';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The list, paged by cursor on the server. Typing waits 300 ms; any other filter or the sort applies at once.
 * A newer query always wins over an older answer still in flight (`seq`). Rows already shown stay on screen while
 * the next result loads (`refreshing`), so the table does not flash empty on every keystroke.
 *
 * `enabled: false` pauses fetching.
 *
 * @returns {{ rows, next, total, status: 'loading'|'ready'|'error', error, offline, refreshing, loadingMore,
 *             typing, loadMore, reload, patchRow, dropRow }}
 */
export function useUserList(filters, sort, { enabled = true } = {}) {
  const [page, setPage] = useState(emptyPage);
  const [meta, setMeta] = useState({ status: 'loading', error: null, offline: false, refreshing: false, loadingMore: false });
  const seq = useRef(0);
  const q = useDebounced(filters.q, SEARCH_DEBOUNCE_MS);
  const applied = useMemo(() => ({ ...filters, q }), [filters, q]);
  const key = JSON.stringify([applied, sort]);
  const keyRef = useRef(key);
  const pageRef = useRef(page);
  pageRef.current = page;

  const fetchPage = useCallback(
    async ({ cursor, replace }) => {
      const mine = ++seq.current;
      const params = buildListQuery(applied, sort, { limit: PAGE_SIZE, cursor });
      setMeta((m) => ({ ...m, refreshing: replace, loadingMore: !replace, error: replace ? null : m.error }));
      try {
        const res = await api.users.page(params);
        if (mine !== seq.current) return;
        setPage((p) => mergePage(p, res, { replace }));
        setMeta({ status: 'ready', error: null, offline: false, refreshing: false, loadingMore: false });
      } catch (e) {
        if (e instanceof Unauthorized || mine !== seq.current) return;
        setMeta((m) => ({ ...m, status: m.status === 'ready' && !replace ? 'ready' : 'error', error: e.message, offline: !!e.offline, refreshing: false, loadingMore: false }));
      }
    },
    // `key` is the identity of (applied, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    if (!enabled) return undefined; // a deep-linked user page does not need the list behind it
    keyRef.current = key;
    fetchPage({ replace: true });
    return () => {
      seq.current += 1;
    };
  }, [fetchPage, key, enabled]);

  const loadMore = useCallback(() => {
    const { next } = pageRef.current;
    if (next) fetchPage({ cursor: next, replace: false });
  }, [fetchPage]);
  const reload = useCallback(() => fetchPage({ replace: true }), [fetchPage]);

  /** Update one loaded row in place (after a block / tag change) without losing the operator's place. */
  const patchRow = useCallback((id, patch) => setPage((p) => ({ ...p, rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })), []);
  const dropRow = useCallback((id) => setPage((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== id), total: p.total == null ? null : Math.max(0, p.total - 1) })), []);

  return { ...page, ...meta, typing: filters.q !== q, loadMore, reload, patchRow, dropRow };
}
