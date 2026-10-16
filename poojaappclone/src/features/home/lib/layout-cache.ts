import { parseLayout } from './layout';
import type { HomeLayout } from './layout-types';

/** AsyncStorage key — one entry per language, because the server filters on `?lang=`. */
export const layoutCacheKey = (lang: 'en' | 'hi') => `home.layout.v2.${lang}`;

export type CachedLayout = { etag: string | null; layout: HomeLayout };

/**
 * What we stored, re-validated on the way out. Anything that is not exactly
 * what `serialiseCache` wrote (truncated, hand-edited, an older schema) is null,
 * and the caller falls back to the bundled default and refetches without an
 * ETag, so a bad cache can never stick.
 */
export function readCache(raw: string | null): CachedLayout | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { etag?: unknown; layout?: unknown };
    const layout = parseLayout(v?.layout);
    if (!layout) return null;
    return { etag: typeof v.etag === 'string' && v.etag ? v.etag : null, layout };
  } catch {
    return null;
  }
}

export const serialiseCache = (layout: HomeLayout, etag: string | null): string => JSON.stringify({ etag, layout });
