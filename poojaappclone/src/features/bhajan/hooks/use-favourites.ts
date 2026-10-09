import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/providers/auth';

import { toggleId } from '../lib/favourites';
import { loadFavourites, saveFavourites } from '../lib/favourites-store';

/** Bookmarked track ids for the signed-in devotee, kept on this phone (AsyncStorage). */
export function useFavourites() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // Remembered WITH the uid it belongs to, so switching accounts never shows the previous list.
  const [entry, setEntry] = useState<{ uid: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    loadFavourites(uid)
      .then((ids) => alive && setEntry({ uid, ids }))
      .catch(() => alive && setEntry({ uid, ids: [] }));
    return () => {
      alive = false;
    };
  }, [uid]);

  const ids = useMemo(() => (entry && entry.uid === uid ? entry.ids : []), [entry, uid]);

  const toggle = useCallback(
    (id: string) => {
      if (!uid) return;
      const next = toggleId(ids, id);
      setEntry({ uid, ids: next });
      saveFavourites(uid, next).catch(() => {
        /* a failed write only means it is not remembered next launch */
      });
    },
    [uid, ids],
  );

  return { ids, toggle, isFavourite: (id: string) => ids.includes(id) };
}
