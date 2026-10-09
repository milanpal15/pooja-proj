import { useCallback, useEffect, useState } from 'react';

import { useLoad } from '@/hooks/use-load';
import { fetchPoojas } from '@/lib/api';

import { type FilterKey, NO_FILTERS, type PoojaFilterState, toQuery, toggleFilter } from '../lib/filters';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The list screen's data: filter state + search box, one request per change.
 * Search text is debounced so typing does not fire a request per keystroke.
 * The filter OPTIONS come back with every response (`filters`), so they always
 * match what is actually bookable.
 */
/** `initialQuery` seeds the search box (Home's search bar opens `/poojas?q=…`). */
export function usePoojaList(temple?: string, initialQuery = '') {
  const [filters, setFilters] = useState<PoojaFilterState>({ ...NO_FILTERS, q: initialQuery });
  const [search, setSearch] = useState(initialQuery);

  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const { festival, tithi, place, q } = filters;
  const load = useCallback(
    () => fetchPoojas(toQuery({ festival, tithi, place, q }, temple)),
    [festival, tithi, place, q, temple],
  );
  const res = useLoad(load);

  const toggle = useCallback(
    (key: FilterKey, value: string) => setFilters((f) => toggleFilter(f, key, value)),
    [],
  );
  const clear = useCallback(() => {
    setFilters(NO_FILTERS);
    setSearch('');
  }, []);

  return { ...res, filters, search, setSearch, toggle, clear };
}
