import { useMemo, useState } from 'react';

import { useContent } from '@/providers/content';
import { useLocation } from '@/hooks/use-location';
import { byDistanceFrom } from '@/lib/geo';
import { useSavedTemples } from '@/lib/saved-temples';

/**
 * The temple directory's list: search, "saved only", and "Near Me" ranking.
 * `initialSearch` is the route's `search` param, which re-seeds the query
 * whenever it changes.
 */
export function useTempleList(initialSearch: string | undefined) {
  const { templeList } = useContent();
  const { state: loc, request, clear } = useLocation();
  const { savedIds, isSaved, toggleSave } = useSavedTemples();

  const [query, setQuery] = useState(initialSearch ?? '');
  const [nearMe, setNearMe] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [prevParamSearch, setPrevParamSearch] = useState(initialSearch);

  if (initialSearch !== prevParamSearch) {
    setPrevParamSearch(initialSearch);
    setQuery(initialSearch ?? '');
  }

  const q = query.trim().toLowerCase();

  // Ranked by distance only once we actually have a fix; otherwise the
  // catalogue keeps its curated order rather than silently reshuffling.
  const list = useMemo(() => {
    let base = templeList;
    if (onlySaved) {
      base = base.filter((tpl) => savedIds.includes(tpl.id));
    }

    const ranked =
      nearMe && loc.status === 'granted'
        ? byDistanceFrom(loc.coords, base)
        : base.map((tpl) => ({ ...tpl, km: undefined as number | undefined }));

    return ranked.filter(
      (tpl) =>
        tpl.name.toLowerCase().includes(q) || tpl.location.toLowerCase().includes(q),
    );
  }, [nearMe, loc, q, onlySaved, savedIds, templeList]);

  const toggleNearMe = () => {
    if (nearMe) {
      setNearMe(false);
      clear();
    } else {
      setNearMe(true);
      request();
    }
  };

  return {
    query,
    setQuery,
    nearMe,
    onlySaved,
    setOnlySaved,
    loc,
    request,
    savedIds,
    isSaved,
    toggleSave,
    list,
    toggleNearMe,
  };
}
