import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

/**
 * The foreground position watcher for a Yatra screen (docs/EVENTS.md §11.4): balanced accuracy, at
 * least 10 m / 5 s between updates. It exists ONLY while `enabled` is true — the caller passes true
 * when permission is granted, the screen is focused and the app is in the foreground, and a stop is
 * open — and is removed the moment that stops being so, and on unmount. `onPosition` may change on
 * every render without restarting the watcher.
 */
export function useRouteWatch(enabled: boolean, onPosition: (pos: Location.LocationObject) => void) {
  const handler = useRef(onPosition);
  useEffect(() => {
    handler.current = onPosition;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
      (pos) => {
        if (!cancelled) handler.current(pos);
      },
    )
      .then((s) => {
        // The effect may have been torn down while the subscription was being created.
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
      sub = null;
    };
  }, [enabled]);
}
