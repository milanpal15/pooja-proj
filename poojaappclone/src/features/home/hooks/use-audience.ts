import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

import { fetchBookings, fetchMyEvents } from '@/lib/api';
import { useAuth } from '@/providers/auth';

import { hasActiveBooking, inActiveEvent, isLapsed, isNewUser } from '../lib/audience';
import type { Segment } from '../lib/layout-types';
import { useNow } from './use-now';

/*
 * Audience segments for this device (docs/HOME_LAYOUT.md §9.1). Nothing here
 * blocks Home: every segment starts "not matching" and flips when its data
 * arrives, so only audience-gated blocks appear late. Offline / signed out /
 * failed = not matching (a cached answer, if any, is used first).
 */

const LAST_OPEN_KEY = 'home.lastOpenAt';
let launch: Promise<boolean> | null = null;

/**
 * `lapsed`, decided ONCE per launch: read the stored last-open time BEFORE
 * writing now, so this launch is judged against the previous one.
 */
function lapsedThisLaunch(): Promise<boolean> {
  launch ??= (async () => {
    const now = Date.now();
    let last: string | null = null;
    try {
      last = await AsyncStorage.getItem(LAST_OPEN_KEY);
    } catch {
      // unreadable = unknown = not lapsed
    }
    AsyncStorage.setItem(LAST_OPEN_KEY, new Date(now).toISOString()).catch(() => {});
    return isLapsed(last, now);
  })();
  return launch;
}

/** A yes/no that needs the network: the cached answer at once, then the fresh one. `enabled` false = no request at all. */
function useRemoteFact(cacheKey: string, enabled: boolean, ask: () => Promise<boolean>): boolean {
  const [state, setState] = useState<{ key: string; value: boolean }>({ key: '', value: false });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let answered = false;
    const set = (value: boolean) => alive && setState({ key: cacheKey, value });
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!answered && (raw === '1' || raw === '0')) set(raw === '1');
      })
      .catch(() => {});
    ask()
      .then((value) => {
        answered = true;
        set(value);
        AsyncStorage.setItem(cacheKey, value ? '1' : '0').catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // `ask` is stable per cacheKey (it only closes over module functions).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled]);
  return enabled && state.key === cacheKey && state.value;
}

/**
 * The segments true for this device. `needed` is the set of tags the current
 * layouts actually use: a segment nobody asks for costs no request. The
 * last-open time is recorded on every launch regardless.
 */
export function useAudienceSegments(needed: ReadonlySet<string>): ReadonlySet<Segment> {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const createdAt = user?.createdAt ?? null;
  const now = useNow(3_600_000);

  const [lapsed, setLapsed] = useState(false);
  useEffect(() => {
    let alive = true;
    lapsedThisLaunch().then((v) => alive && setLapsed(v), () => {});
    return () => {
      alive = false;
    };
  }, []);

  const hasBooking = useRemoteFact(`home.seg.booking.${uid}`, !!uid && needed.has('has_booking'), async () => hasActiveBooking(await fetchBookings()));
  const inEvent = useRemoteFact(`home.seg.event.${uid}`, !!uid && needed.has('in_event'), async () => inActiveEvent(await fetchMyEvents()));
  const fresh = !!uid && isNewUser(createdAt, now);

  return useMemo(() => {
    const out = new Set<Segment>();
    if (fresh) out.add('new_user');
    if (hasBooking) out.add('has_booking');
    if (inEvent) out.add('in_event');
    if (lapsed) out.add('lapsed');
    return out;
  }, [fresh, hasBooking, inEvent, lapsed]);
}
