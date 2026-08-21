import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { ADMIN_API } from '@/constants/config';

/** Shapes returned by the admin backend's public `/api/content` endpoint. */
export type RemoteDeity = {
  slug: string;
  name: string;
  title?: string;
  mark?: string;
  mantra?: string;
  imageUrl?: string;
  accent?: string;
};
export type RemoteTemple = {
  slug: string;
  name: string;
  location?: string;
  deitySlug?: string;
  imageUrl?: string;
  aartiTime?: string;
  offerings?: string[];
  /** Whether real pooja booking is arranged with this temple. */
  bookingEnabled?: boolean;
};
export type RemoteAarti = {
  _id: string;
  title: string;
  artist?: string;
  deitySlug?: string;
  audioUrl?: string;
  duration?: string;
};

type Content = {
  deities: RemoteDeity[];
  temples: RemoteTemple[];
  aartis: RemoteAarti[];
};

type ContentContextValue = Content & {
  /** True until the first fetch settles (success or failure). */
  loading: boolean;
  /** Remote artwork for a deity id, ready to drop into <Image source>. */
  deityImage: (id: string) => ImageSourcePropType | undefined;
  /**
   * Whether a temple accepts real pooja bookings, per the admin dashboard.
   *
   * Only an explicit `false` disables. An unknown temple — backend
   * unreachable, or a slug the dashboard has never seen — reads as enabled,
   * matching the schema's own default rather than making every temple look
   * broken while offline.
   *
   * That is a deliberate fail-open, and it is the weaker half of this
   * feature: a temple switched off while the device is offline still shows
   * its button. The fix is the cached last-known-good content described in
   * the LLD, not a different default here.
   */
  bookingEnabled: (slug: string) => boolean;
};

const EMPTY: Content = { deities: [], temples: [], aartis: [] };

/**
 * Resolve a stored asset path against the backend. Uploaded files are stored
 * host-relative (`/uploads/x.png`) so the same value works from any host; older
 * absolute URLs are passed through unchanged.
 */
export function assetUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `${ADMIN_API}${url}`;
}

const ContentContext = createContext<ContentContextValue>({
  ...EMPTY,
  loading: true,
  deityImage: () => undefined,
  bookingEnabled: () => true,
});

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<Content>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch(`${ADMIN_API}/api/content`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setContent({
            deities: data.deities ?? [],
            temples: data.temples ?? [],
            aartis: data.aartis ?? [],
          });
        }
      })
      .catch(() => {
        // offline / backend down — screens fall back to local constants
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const value = useMemo<ContentContextValue>(() => {
    const imageBySlug = new Map(
      content.deities.filter((d) => d.imageUrl).map((d) => [d.slug, d.imageUrl as string]),
    );
    const templeBySlug = new Map(content.temples.map((tpl) => [tpl.slug, tpl]));

    return {
      ...content,
      loading,
      deityImage: (id) => {
        const url = assetUrl(imageBySlug.get(id));
        return url ? { uri: url } : undefined;
      },
      bookingEnabled: (slug) => templeBySlug.get(slug)?.bookingEnabled !== false,
    };
  }, [content, loading]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  return useContext(ContentContext);
}
