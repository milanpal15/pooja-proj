import { useMemo, useState } from 'react';

import { useFavourites } from './use-favourites';
import { deitiesPresent, filterTracks } from '../lib/filter';
import { kindsPresent } from '../lib/kind';
import { todaysPick } from '../lib/today';
import type { Track, TrackKind } from '../types';

/** Filter state and derived chip lists for the Bhajan shelf. */
export function useShelf(tracks: Track[], favouritesOnly: boolean) {
  const [deity, setDeity] = useState('');
  const [kind, setKind] = useState<TrackKind | ''>('');
  const fav = useFavourites();

  const visible = useMemo(
    () => filterTracks(tracks, { deity, kind, favouritesOnly, favourites: fav.ids }),
    [tracks, deity, kind, favouritesOnly, fav.ids],
  );
  const deities = useMemo(() => deitiesPresent(tracks), [tracks]);
  const kinds = useMemo(() => kindsPresent(tracks), [tracks]);
  const today = useMemo(() => todaysPick(tracks, new Date()), [tracks]);

  return {
    visible,
    deities,
    kinds,
    today,
    deity,
    setDeity,
    kind,
    // Tapping the selected tile clears it.
    pickKind: (k: TrackKind) => setKind((cur) => (cur === k ? '' : k)),
    fav,
  };
}
