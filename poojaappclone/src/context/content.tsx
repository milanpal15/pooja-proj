import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { ADMIN_API } from '@/constants/config';
import { DEITY_IMAGES } from '@/constants/deity-images';
import { type Festival, FESTIVALS } from '@/constants/home';
import { SEVAS as BUNDLED_SEVAS, type Seva } from '@/constants/poojas';

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
  /** 0–5. Absent when nobody has entered one — do not invent a default. */
  rating?: number;
  reviews?: number;
};
export type RemoteAarti = {
  _id: string;
  title: string;
  artist?: string;
  deitySlug?: string;
  audioUrl?: string;
  duration?: string;
};

export type RemoteFestival = {
  _id: string;
  slug: string;
  name: string;
  nameHi?: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  deitySlug?: string;
};

export type RemoteSeva = {
  _id: string;
  slug: string;
  name: string;
  nameHi?: string;
  description?: string;
  descriptionHi?: string;
  price: number;
  duration?: string;
  templeSlug?: string;
  deitySlugs?: string[];
};

export type RemoteKnowledge = {
  _id: string;
  deitySlug: string;
  epithet?: string;
  epithetHi?: string;
  about?: string;
  aboutHi?: string;
  facts?: { k: string; kHi: string; v: string; vHi: string }[];
  texts?: string[];
  textsHi?: string[];
  festivals?: string[];
  festivalsHi?: string[];
};

export type RemoteFaq = {
  _id: string;
  slug: string;
  category: string;
  categoryTitle?: string;
  categoryTitleHi?: string;
  question: string;
  questionHi?: string;
  answer: string;
  answerHi?: string;
};

export type RemoteHeroSlide = {
  _id: string;
  slug: string;
  title: string;
  titleHi?: string;
  subtitle?: string;
  subtitleHi?: string;
  deitySlug?: string;
  href?: string;
};

export type RemoteAnnouncement = { title: string; body?: string; severity?: string };

type Content = {
  deities: RemoteDeity[];
  temples: RemoteTemple[];
  aartis: RemoteAarti[];
  festivals: RemoteFestival[];
  sevas: RemoteSeva[];
  knowledge: RemoteKnowledge[];
  faqs: RemoteFaq[];
  hero: RemoteHeroSlide[];
  /** Flat key/value map: prasadDelivery, supportEmail, supportPhone… */
  settings: Record<string, string>;
  announcement: RemoteAnnouncement | null;
};

type ContentContextValue = Content & {
  /** True until the first fetch settles (success or failure). */
  loading: boolean;
  /** Remote artwork for a deity id, ready to drop into <Image source>. */
  deityImage: (id: string) => ImageSourcePropType | undefined;
  /**
   * The artwork to actually render: admin-managed when the dashboard has one,
   * the bundled murti otherwise.
   *
   * Screens should use this rather than reaching for `DEITY_IMAGES` directly.
   * Doing so is what made the deity row ignore the dashboard entirely — the
   * bundled art is the *fallback*, not the source of truth, and the app has
   * to keep working with the backend unreachable either way.
   */
  deityArt: (id: string) => ImageSourcePropType | undefined;
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
  /**
   * Upcoming vrats and festivals, soonest first.
   *
   * Prefers the admin-managed calendar and falls back to the bundled list
   * when the backend is unreachable — or when the backend has one but every
   * date in it has already passed, which is the failure the bundled list also
   * suffers from. Either source can run dry; the screens show an empty state.
   */
  upcomingFestivals: (limit?: number) => Festival[];
  /**
   * A temple's real rating, or undefined.
   *
   * Every card used to print the same hardcoded "4.9 stars (25k reviews)"
   * from one i18n string — invented social proof on a screen asking for
   * money. Undefined means the caller hides the row.
   */
  templeRating: (slug: string) => { rating: number; reviews?: number } | undefined;
  /**
   * A numeric app setting, with the bundled value as the fallback.
   *
   * Settings arrive as strings because the dashboard edits them as text; a
   * bad value falls back rather than producing NaN in a price.
   */
  setting: (key: string, fallback: number) => number;
  /** A string app setting. Empty string when unset, so callers can hide UI. */
  settingText: (key: string) => string;
  /**
   * Bookable rites for a temple, admin-priced.
   *
   * Prices used to be compiled into the app, so changing one meant a store
   * release. Falls back to the bundled catalogue when the backend is
   * unreachable — an offline devotee still sees a price, just last week's.
   */
  sevasFor: (opts: { templeSlug?: string; deitySlug?: string }) => Seva[];
};

const EMPTY: Content = {
  deities: [],
  temples: [],
  aartis: [],
  festivals: [],
  sevas: [],
  knowledge: [],
  faqs: [],
  hero: [],
  settings: {},
  announcement: null,
};

/** Today in LOCAL time as `YYYY-MM-DD` — `toISOString()` would shift the day. */
function todayKey() {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function filterUpcoming(list: Festival[], limit: number): Festival[] {
  const today = todayKey();
  return list
    .filter((f) => f.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

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
  // Outside a provider there is no dashboard, so the bundled murti is it.
  deityArt: (id) => DEITY_IMAGES[id],
  bookingEnabled: () => true,
  // Outside a provider the bundled calendar is all there is.
  upcomingFestivals: (limit = 4) => filterUpcoming(FESTIVALS, limit),
  templeRating: () => undefined,
  setting: (_k, fallback) => fallback,
  settingText: () => '',
  sevasFor: () => BUNDLED_SEVAS,
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
            festivals: data.festivals ?? [],
            sevas: data.sevas ?? [],
            knowledge: data.knowledge ?? [],
            faqs: data.faqs ?? [],
            hero: data.hero ?? [],
            settings: data.settings ?? {},
            announcement: data.announcement ?? null,
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
      deityArt: (id) => {
        const url = assetUrl(imageBySlug.get(id));
        return url ? { uri: url } : DEITY_IMAGES[id];
      },
      bookingEnabled: (slug) => templeBySlug.get(slug)?.bookingEnabled !== false,
      sevasFor: ({ templeSlug, deitySlug }) => {
        const remote = content.sevas
          .filter((s) => !s.templeSlug || s.templeSlug === templeSlug)
          .filter((s) => !s.deitySlugs?.length || (!!deitySlug && s.deitySlugs.includes(deitySlug)))
          .map<Seva>((s) => ({
            id: s.slug,
            name: s.name,
            nameHi: s.nameHi || s.name,
            description: s.description || '',
            price: s.price,
            duration: s.duration || '',
          }));
        return remote.length ? remote : BUNDLED_SEVAS;
      },
      setting: (key, fallback) => {
        const n = Number(content.settings[key]);
        return Number.isFinite(n) ? n : fallback;
      },
      settingText: (key) => content.settings[key] ?? '',
      templeRating: (slug) => {
        const tpl = templeBySlug.get(slug);
        if (typeof tpl?.rating !== 'number' || tpl.rating <= 0) return undefined;
        return { rating: tpl.rating, reviews: tpl.reviews };
      },
      upcomingFestivals: (limit = 4) => {
        const remote: Festival[] = content.festivals.map((f) => ({
          id: f.slug,
          name: f.name,
          nameHi: f.nameHi || f.name,
          date: f.date,
          deity: f.deitySlug || 'shiva',
        }));
        const fromRemote = filterUpcoming(remote, limit);
        return fromRemote.length ? fromRemote : filterUpcoming(FESTIVALS, limit);
      },
    };
  }, [content, loading]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  return useContext(ContentContext);
}
