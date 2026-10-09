import { useCallback } from 'react';

import { useLoad } from '@/hooks/use-load';
import { fetchChadhavaListing, fetchChadhavaListings } from '@/lib/api';

/** Listings for one category ('' = all). Categories come back with every response. */
export function useListings(category: string) {
  const load = useCallback(() => fetchChadhavaListings(category || undefined), [category]);
  return useLoad(load);
}

export function useListing(slug: string) {
  const load = useCallback(() => fetchChadhavaListing(slug), [slug]);
  return useLoad(load);
}
