import { useCallback } from 'react';

import { useLoad } from '@/hooks/use-load';
import { fetchAstrologers, fetchBookings, fetchChadhavaListings, fetchPoojas } from '@/lib/api';
import { useAdmin } from '@/providers/admin';
import { useAuth } from '@/providers/auth';

/*
 * Every Home block that needs the API reads it here. Each is best-effort: a
 * failure leaves `data` undefined and the block simply is not drawn (no blank
 * hole, no error banner on the front page).
 */

const recent = new Map<string, { at: number; p: Promise<unknown> }>();

/**
 * Home blocks mount independently now, and several read the same feed (the
 * featured pooja and the pooja shelf). Requests for one key inside `ttlMs`
 * share a single promise instead of each hitting the API; a failure is
 * forgotten at once so the next mount retries.
 */
function shared<T>(key: string, fn: () => Promise<T>, ttlMs = 15_000): Promise<T> {
  const hit = recent.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn();
  recent.set(key, { at: Date.now(), p });
  p.catch(() => {
    if (recent.get(key)?.p === p) recent.delete(key);
  });
  return p;
}

/** Open poojas — feeds the featured pooja, the "Upcoming poojas" shelf and any other block bound to them. */
export function useHomePoojas() {
  const load = useCallback(() => shared('poojas', () => fetchPoojas()), []);
  return useLoad(load);
}

export function useHomeChadhava() {
  const load = useCallback(() => shared('chadhava', () => fetchChadhavaListings()), []);
  return useLoad(load);
}

/** The devotee's own bookings; resolves to [] when signed out so no request is made. */
export function useHomeBookings() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const load = useCallback(() => (uid ? fetchBookings() : Promise.resolve([])), [uid]);
  return useLoad(load);
}

/** Astrologers — only requested while the astrologer-calls flag is on. */
export function useHomeAstrologers() {
  const { flags } = useAdmin();
  const on = !!flags.astrologerCalls;
  const load = useCallback(() => (on ? fetchAstrologers() : Promise.resolve([])), [on]);
  return useLoad(load);
}
