import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { useContent } from '@/providers/content';
import { DEFAULT_PLACE } from '@/lib/panchang';

/**
 * Where the numbers are for: the dashboard's first temple, replaced by the
 * device's own position when it will say. Sunrise — and every window derived
 * from it — moves by the hour across India.
 */
export function usePanchangPlace(hi: boolean) {
  const { templeList } = useContent();

  const [place, setPlace] = useState<{ lat: number; lng: number; label: string }>(() => {
    const first = templeList[0];
    return first?.coords.lat
      ? { lat: first.coords.lat, lng: first.coords.lng, label: first.location }
      : DEFAULT_PLACE;
  });

  // Best-effort: a refused permission just leaves the fallback in place.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !alive) return;
        const pos = await Location.getLastKnownPositionAsync();
        if (!pos || !alive) return;
        setPlace({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: hi ? 'आपका स्थान' : 'Your location',
        });
      } catch {
        // Keep the fallback.
      }
    })();
    return () => {
      alive = false;
    };
  }, [hi]);

  return place;
}
