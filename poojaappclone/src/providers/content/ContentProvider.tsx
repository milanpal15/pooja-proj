import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

import { ADMIN_API } from '@/constants/config';

import { buildContentValue } from './build-value';
import { CACHE_KEY, normalise } from './cache';
import { ContentContext, EMPTY } from './context';
import type { Content, ContentContextValue } from './types';

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<Content>(EMPTY);
  const [loading, setLoading] = useState(true);

  /*
   * Cache first, then network.
   *
   * The bundled catalogues used to be the offline story: no network meant
   * falling back to a copy of the content compiled into the app. That made
   * the bundle a second source of truth which drifted from the dashboard
   * and could not be corrected without a store release.
   *
   * Last-known-good caching replaces it. The first launch on a new device
   * still needs the network — there is nothing honest to show before the
   * temple has ever been reached — but every launch after that renders
   * instantly from disk and reconciles in the background.
   */
  useEffect(() => {
    let alive = true;

    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        // Only fills the gap before the network answers; a live response
        // always wins, so a slow read cannot clobber fresh content.
        setContent((current) => (current === EMPTY ? normalise(JSON.parse(raw)) : current));
      })
      .catch(() => {});

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch(`${ADMIN_API}/api/content`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !alive) return;
        setContent(normalise(data));
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
      })
      .catch(() => {
        // Offline, or the temple is unreachable. Whatever the cache gave us
        // stays on screen; a first-ever launch shows empty states.
      })
      .finally(() => {
        clearTimeout(timer);
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const value = useMemo<ContentContextValue>(
    () => buildContentValue(content, loading),
    [content, loading],
  );

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
