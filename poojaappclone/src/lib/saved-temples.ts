import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchSavedTemples, putSavedTemples } from './api';

/**
 * The temples this devotee bookmarked.
 *
 * They used to be a list of slugs in this phone's AsyncStorage, seeded with
 * Kashi Vishwanath and Siddhivinayak — so every devotee started with the
 * same two "saved" temples they had never saved, and the real ones were
 * lost on reinstall. They are on the account now, keyed to the Firebase
 * uid, and come back on any device the devotee signs in to.
 */
export function useSavedTemples() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  /*
   * Written as a promise chain, not `await` in an async effect: every
   * callback here runs in a later tick, which is what keeps setState out of
   * the synchronous effect body.
   *
   * `alive` is not ceremony — leaving this screen while the request is in
   * flight would otherwise set state on a component that is gone.
   */
  const load = useCallback(
    (alive: () => boolean = () => true) =>
      fetchSavedTemples()
        .then((slugs) => {
          if (alive()) setSavedIds(slugs);
        })
        .catch(() => {
          // Unreachable temple: show nothing saved rather than something
          // wrong. A failed write is reverted below, so no bookmark is lost.
        })
        .finally(() => {
          if (alive()) setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    let alive = true;
    load(() => alive);
    return () => {
      alive = false;
    };
  }, [load]);

  /*
   * The list is written whole, so two taps in quick succession would race —
   * the second PUT carries state the first has not finished applying. This
   * keeps the last list we sent, so each write builds on the previous one
   * rather than on whatever the server last echoed back.
   */
  const inFlight = useRef<Promise<unknown>>(Promise.resolve());

  const toggleSave = useCallback(async (id: string) => {
    let before: string[] = [];
    let next: string[] = [];
    setSavedIds((prev) => {
      before = prev;
      next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return next;
    });

    // Queued behind any write still running, so they land in tap order.
    inFlight.current = inFlight.current
      .catch(() => {})
      .then(() => putSavedTemples(next))
      .then((slugs) => setSavedIds(slugs))
      .catch(() => {
        // Put the heart back rather than leave it showing a state the
        // server never accepted.
        setSavedIds(before);
      });
    await inFlight.current;
  }, []);

  const isSaved = useCallback((id: string) => savedIds.includes(id), [savedIds]);

  return { savedIds, isSaved, toggleSave, refresh: load, loading };
}
