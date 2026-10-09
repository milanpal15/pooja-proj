import { useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { idOf } from '../../../lib/ids.js';
import { useConfirm, useToast } from '../../../ui/index.js';

/** The search text, delayed so typing does not fire a request per key. */
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * A list of bookings or orders with its status/search filters and the
 * forward-only status move. The move asks first (it tells the devotee) and
 * then patches the row from the server's answer's status, so the table never
 * shows a state the API did not confirm.
 */
function useStatusList({ fetchRows, setStatus, noun }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ q: '', status: '' });
  const q = useDebounced(filters.q);
  const list = useLoader(() => fetchRows({ q: q.trim(), status: filters.status, limit: 200 }), { deps: [q, filters.status] });
  const [busy, setBusy] = useState('');

  const advance = async (row, step) => {
    const ok = await confirm({
      title: step.label,
      message: `${row.bookingRef || row.ref} moves to “${step.to === 'sankalp' ? 'Sankalp done' : step.to[0].toUpperCase() + step.to.slice(1)}”. The devotee is notified, and ${noun} cannot be moved back.`,
      confirmLabel: step.label,
    });
    if (!ok) return;
    setBusy(idOf(row));
    try {
      await setStatus(idOf(row), step.to);
      toast.success('Status updated');
      await list.reload();
    } catch (e) {
      toast.error(`Could not update. ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  return { ...list, rows: list.data || [], filters, setFilter: (k, v) => setFilters((f) => ({ ...f, [k]: v })), busy, advance };
}

const usePoojaBookings = () => useStatusList({ fetchRows: (p) => api.bookings(p), setStatus: api.setBookingStatus, noun: 'a booking' });
const useChadhavaOrders = () => useStatusList({ fetchRows: (p) => api.chadhavaOrders(p), setStatus: api.setChadhavaOrderStatus, noun: 'an order' });

/**
 * One list of pooja bookings and chadhava orders, newest first, with one
 * search / status filter and a Type filter. Each kind keeps its own forward
 * move; `advance` routes a row to the right one.
 */
export function useAllBookings() {
  const pj = usePoojaBookings();
  const ch = useChadhavaOrders();
  const [type, setType] = useState('');
  const kinds = type === 'pooja' ? [pj] : type === 'chadhava' ? [ch] : [pj, ch];
  const rows = [
    ...(type === 'chadhava' ? [] : pj.rows.map((r) => ({ ...r, kind: 'pooja', ref: r.bookingRef }))),
    ...(type === 'pooja' ? [] : ch.rows.map((r) => ({ ...r, kind: 'chadhava', bookingRef: r.ref }))),
  ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const status = kinds.some((k) => k.status === 'error') ? 'error' : kinds.some((k) => k.status === 'loading') ? 'loading' : kinds.some((k) => k.status === 'stale') ? 'stale' : 'ready';
  const failed = kinds.find((k) => k.status === 'error');
  return {
    rows,
    status,
    error: failed?.error,
    offline: failed?.offline,
    reload: () => Promise.all(kinds.map((k) => k.reload())),
    filters: { ...pj.filters, type },
    setFilter: (k, v) => {
      if (k === 'type') setType(v);
      else {
        pj.setFilter(k, v);
        ch.setFilter(k, v);
      }
    },
    busy: pj.busy || ch.busy,
    advance: (row, step) => (row.kind === 'chadhava' ? ch.advance(row, step) : pj.advance(row, step)),
  };
}

/** Reviews, the Hide / Show switch and text editing (orders:edit). */
export function useReviews() {
  const toast = useToast();
  const [hidden, setHidden] = useState('');
  const [pooja, setPooja] = useState('');
  const list = useLoader(() => api.reviews({ hidden }), { deps: [hidden] });
  const [busy, setBusy] = useState('');
  const all = list.data || [];

  const setReviewHidden = async (review, next) => {
    setBusy(idOf(review));
    try {
      await api.setReviewHidden(idOf(review), next);
      toast.success(next ? 'Review hidden' : 'Review shown');
      await list.reload();
    } catch (e) {
      toast.error(`Could not update. ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  /** Resolves true when saved so the modal can close; false leaves it open with the toast. */
  const saveReviewText = async (review, text) => {
    setBusy(idOf(review));
    try {
      await api.setReviewText(idOf(review), text);
      toast.success('Review updated');
      await list.reload();
      return true;
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
      return false;
    } finally {
      setBusy('');
    }
  };

  return {
    ...list,
    rows: pooja ? all.filter((r) => r.poojaTitle === pooja) : all,
    poojas: [...new Set(all.map((r) => r.poojaTitle).filter(Boolean))],
    hidden,
    setHidden,
    pooja,
    setPooja,
    busy,
    setReviewHidden,
    saveReviewText,
  };
}
