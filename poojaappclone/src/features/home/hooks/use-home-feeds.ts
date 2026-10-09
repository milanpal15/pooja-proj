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

/** Open poojas — feeds both the featured promo and the "Upcoming poojas" row. */
export function useHomePoojas() {
  const load = useCallback(() => fetchPoojas(), []);
  return useLoad(load);
}

export function useHomeChadhava() {
  const load = useCallback(() => fetchChadhavaListings(), []);
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
