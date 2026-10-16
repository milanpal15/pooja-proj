import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { useLanguage } from '@/i18n';
import { fetchHomeLayout } from '@/lib/api';

import { DEFAULT_LAYOUT } from '../constants/default-layout';
import { parseLayout } from '../lib/layout';
import { layoutCacheKey, legacyLayoutCacheKey, readCache, serialiseCache } from '../lib/layout-cache';
import type { HomeLayout } from '../lib/layout-types';

/** Layouts seen this session, so coming back to Home (or a language switch back) paints at once. */
const memory = new Map<string, HomeLayout>();

/**
 * Home's layout set (docs/HOME_LAYOUT.md §9): this session's copy or the cached one (per language) at once,
 * then a background refresh (`If-None-Match`; 304 keeps the cache). A failed
 * refresh keeps what is shown; with nothing cached the bundled default is used.
 * Never throws and never returns nothing — `ready` only says the cache read has
 * finished, so the first paint is not the default flashing before the real one.
 */
export function useHomeLayout(): { layout: HomeLayout; ready: boolean } {
  const { lang } = useLanguage();
  const l: 'en' | 'hi' = lang === 'hi' ? 'hi' : 'en';
  const [state, setState] = useState<{ lang: string; layout: HomeLayout } | null>(() => {
    const m = memory.get(l);
    return m ? { lang: l, layout: m } : null;
  });

  useEffect(() => {
    let alive = true;
    const key = layoutCacheKey(l);
    const show = (layout: HomeLayout) => {
      memory.set(l, layout);
      if (alive) setState({ lang: l, layout });
    };

    (async () => {
      let etag: string | null = null;
      try {
        // The v3 cache, else the previous build's (a v1 document, upgraded on parse).
        const current = readCache(await AsyncStorage.getItem(key));
        const cached = current ?? readCache(await AsyncStorage.getItem(legacyLayoutCacheKey(l)));
        if (cached) {
          // A legacy entry's ETag belongs to the old body shape; refetch it fully.
          etag = current ? current.etag : null;
          if (!memory.has(l)) show(cached.layout);
        } else if (!memory.has(l)) {
          show(DEFAULT_LAYOUT);
        }
      } catch {
        if (!memory.has(l)) show(DEFAULT_LAYOUT);
      }

      try {
        const res = await fetchHomeLayout(l, etag);
        if (res.notModified) return;
        const fresh = parseLayout(res.body);
        if (!fresh) return;
        show(fresh);
        AsyncStorage.setItem(key, serialiseCache(fresh, res.etag)).catch(() => {});
      } catch {
        // Offline / API down: keep whatever is already showing.
      }
    })();

    return () => {
      alive = false;
    };
  }, [l]);

  const current = state && state.lang === l ? state.layout : memory.get(l);
  return { layout: current ?? DEFAULT_LAYOUT, ready: !!current };
}
