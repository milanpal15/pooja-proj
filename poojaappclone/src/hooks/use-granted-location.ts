import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { Coords } from '@/lib/geo';

/**
 * The device's last known position — but ONLY if location permission was
 * already granted. Home never prompts; the Temples tab owns that ask.
 */
export function useGrantedLocation(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => {
        if (pos && alive) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return coords;
}
