import { useMemo } from 'react';

import { computePanchang, DEFAULT_PLACE, type Panchang } from '@/lib/panchang';
import { useContent } from '@/providers/content';

import type { Coords } from '@/lib/geo';
import { useNow } from './use-now';

/**
 * Today's panchang for the device position (if already granted), else the
 * dashboard's first temple, else Varanasi. Computed on-device, so it works
 * offline. Null if the computation throws — the card is then omitted.
 */
export function useHomePanchang(here: Coords | null): Panchang | null {
  const { templeList } = useContent();
  const first = templeList.find((t) => t.coords.lat);
  const lat = here?.lat ?? first?.coords.lat ?? DEFAULT_PLACE.lat;
  const lng = here?.lng ?? first?.coords.lng ?? DEFAULT_PLACE.lng;
  const day = new Date(useNow(60_000)).toDateString();

  return useMemo(() => {
    try {
      return computePanchang(new Date(), lat, lng);
    } catch {
      return null;
    }
    // `day` is the cache key: the panchang only changes when the date does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, lat, lng]);
}
