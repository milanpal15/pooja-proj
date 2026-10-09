import type { PoojaQuery } from '@/lib/api';

export type FilterKey = 'festival' | 'tithi' | 'place';

/** The user's filter choices; empty string = "any". `temple` comes from the route. */
export type PoojaFilterState = { festival: string; tithi: string; place: string; q: string };

export const NO_FILTERS: PoojaFilterState = { festival: '', tithi: '', place: '', q: '' };

/** Query for `GET /api/poojas`. Blank values are dropped by the client's `qs`. */
export const toQuery = (f: PoojaFilterState, temple?: string): PoojaQuery => ({
  temple: temple || undefined,
  festival: f.festival || undefined,
  tithi: f.tithi || undefined,
  place: f.place || undefined,
  q: f.q.trim() || undefined,
});

/** How many of the three chip filters are set (search text not counted). */
export const activeCount = (f: PoojaFilterState): number =>
  [f.festival, f.tithi, f.place].filter(Boolean).length;

/** Set one filter; tapping the already-selected value clears it. */
export function toggleFilter(f: PoojaFilterState, key: FilterKey, value: string): PoojaFilterState {
  return { ...f, [key]: f[key] === value ? '' : value };
}
