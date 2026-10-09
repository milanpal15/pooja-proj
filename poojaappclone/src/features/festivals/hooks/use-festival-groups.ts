import { useMemo } from 'react';

import { useContent } from '@/providers/content';

import { groupByMonth } from '../lib/group-by-month';

/** Upcoming only, grouped by month, each group in date order. */
export function useFestivalGroups(hi: boolean) {
  // Same source as Home: admin calendar first, bundled list as fallback.
  const { upcomingFestivals } = useContent();

  return useMemo(() => {
    // A high limit rather than a page: this list is a calendar year at most.
    const upcoming = upcomingFestivals(200);
    return groupByMonth(upcoming, hi);
  }, [hi, upcomingFestivals]);
}
