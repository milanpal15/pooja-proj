import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchNearbyTemples, type NearbyTemple } from '@/lib/api';

import { DEFAULT_ATTRIBUTION } from '../constants/map';
import type { SearchArea } from '../lib/geometry';

export type PlacesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The OSM temples around a point. One request at a time matters more than any one request: a newer
 * search supersedes an older one, and a failed search KEEPS the pins already shown (the map still
 * works with only the dashboard temples). Searches are always user- or first-fix-initiated; nothing
 * here fires on pan.
 */
export function useNearbyPlaces() {
  const [places, setPlaces] = useState<NearbyTemple[]>([]);
  const [status, setStatus] = useState<PlacesStatus>('idle');
  /** The last area that loaded; the "moved far enough" reference. */
  const [searched, setSearched] = useState<SearchArea | null>(null);
  /** The area a failed search was for, so Retry repeats it. */
  const [failedArea, setFailedArea] = useState<SearchArea | null>(null);
  const [attribution, setAttribution] = useState(DEFAULT_ATTRIBUTION);
  const seq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const search = useCallback(async (area: SearchArea) => {
    const mine = ++seq.current;
    setStatus('loading');
    try {
      const res = await fetchNearbyTemples(area);
      if (!alive.current || mine !== seq.current) return;
      setPlaces(Array.isArray(res.temples) ? res.temples : []);
      if (res.attribution) setAttribution(res.attribution);
      setSearched(area);
      setFailedArea(null);
      setStatus('ready');
    } catch {
      if (!alive.current || mine !== seq.current) return;
      setFailedArea(area);
      setStatus('error');
    }
  }, []);

  return { places, status, searched, failedArea, attribution, search };
}
