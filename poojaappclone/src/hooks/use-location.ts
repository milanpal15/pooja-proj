import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Coords } from '@/lib/geo';

/**
 * Device position, requested only when the user asks for it.
 *
 * Permission is deliberately *not* requested on mount. A devotional app that
 * demands location before showing anything reads as intrusive, and Android's
 * dialog is a one-shot: deny it once and the fallback path is a trip to
 * system settings. The Temples screen asks only when "Near Me" is tapped.
 */

export type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'granted'; coords: Coords }
  | { status: 'denied' }
  /** Permission held but no fix — airplane mode, indoors, GPS off. */
  | { status: 'unavailable' };

export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const request = useCallback(async () => {
    setState({ status: 'locating' });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (alive.current) setState({ status: 'denied' });
        return;
      }

      // Last known position first — it returns in milliseconds and is plenty
      // for ranking temples hundreds of kilometres apart. A fresh GPS fix can
      // take 10+ seconds indoors, which would make the toggle feel broken.
      const last = await Location.getLastKnownPositionAsync();
      if (last && alive.current) {
        setState({
          status: 'granted',
          coords: { lat: last.coords.latitude, lng: last.coords.longitude },
        });
      }

      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (alive.current) {
        setState({
          status: 'granted',
          coords: { lat: fresh.coords.latitude, lng: fresh.coords.longitude },
        });
      }
    } catch {
      // Distinguish "you said no" from "the radio couldn't answer" — the
      // first needs a settings trip, the second just needs retrying.
      if (alive.current) {
        setState((prev) => (prev.status === 'granted' ? prev : { status: 'unavailable' }));
      }
    }
  }, []);

  const clear = useCallback(() => setState({ status: 'idle' }), []);

  return { state, request, clear };
}
