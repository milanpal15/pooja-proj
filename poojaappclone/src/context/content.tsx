import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { ADMIN_API } from '@/constants/config';
import { type CrownKind, type Deity } from '@/constants/deities';
import { DEITY_IMAGES } from '@/constants/deity-images';
import { type Festival, FESTIVALS } from '@/constants/home';
import { type Seva } from '@/constants/poojas';
import { type Temple } from '@/constants/temples';

/** Shapes returned by the admin backend's public `/api/content` endpoint. */
export type RemoteDeity = {
  slug: string;
  name: string;
  title?: string;
  mark?: string;
  mantra?: string;
  imageUrl?: string;
  offerings?: string[];
  /**
   * How to DRAW this deity when no photograph is set.
   *
   * The sanctum builds a procedural murti from these. They used to live only
   * in `constants/deities.ts`, which meant a deity created in the dashboard
   * rendered grey and crownless — there was no bundled entry to match it to.
   * All optional; the app keeps its own defaults for whatever is missing.
   */
  accent?: string;
  body?: string;
  robe?: string;
  trim?: string;
  crown?: string;
  crescent?: boolean;
  serpent?: boolean;
  elephant?: boolean;
  mace?: boolean;
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
  /** A YouTube or direct stream URL. Empty means this temple is not live. */
  liveUrl?: string;
  /**
   * Presentation, as the sanctum re-themes itself per temple, plus where the
   * pilgrimage map puts the pin and where the temple actually is. All used
   * to live only in `constants/temples.ts`, so a temple added from the
   * dashboard had no colours and no pin.
   */
  mark?: string;
  backdropFrom?: string;
  backdropTo?: string;
  accent?: string;
  trim?: string;
  idol?: string;
  mapX?: number;
  mapY?: number;
  lat?: number;
  lng?: number;
};
export type RemoteAarti = {
  _id: string;
  title: string;
  artist?: string;
  deitySlug?: string;
  audioUrl?: string;
  duration?: string;
  /** Which Bhajan shelf: morning | evening | meditation. */
  category?: string;
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

export type RemoteReminder = {
  slug: string;
  title: string;
  titleHi?: string;
  body?: string;
  bodyHi?: string;
  hour: number;
  minute: number;
  icon?: string;
};

/**
 * An alert tone. `sound` is a bundled resource name, an absolute URL, or
 * '' for silent; null means the device's own default.
 */
export type RemoteTone = {
  slug: string;
  title: string;
  titleHi?: string;
  desc?: string;
  descHi?: string;
  sound?: string | null;
  icon?: string;
};

export type RemoteWallpaperStyle = {
  slug: string;
  title: string;
  titleHi?: string;
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
  reminders: RemoteReminder[];
  tones: RemoteTone[];
  wallpaperStyles: RemoteWallpaperStyle[];
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
   * The deities and temples the screens render, in the app's own shape.
   *
   * These are the lists to use. The raw `deities` / `temples` arrays spread
   * in above are the dashboard's rows, kept for the few places that need a
   * field the app shape does not carry (darshan reads `liveUrl`).
   *
   * Empty is a real answer. Nothing is compiled into the app any more, so
   * an unpublished dashboard means empty states — which is how an unfilled
   * dashboard is supposed to look.
   */
  deityList: Deity[];
  templeList: Temple[];
  /** A deity's display name for a slug; the slug itself if unknown. */
  deityName: (slug: string) => string;
  /**
   * Look one up by slug, falling back to the first in the list.
   *
   * Returns undefined when there is nothing at all — an unfilled dashboard
   * — so callers must handle an empty sanctum rather than assuming a deity
   * always exists, which the bundled catalogue used to guarantee.
   */
  deityById: (id?: string | string[]) => Deity | undefined;
  templeById: (id?: string | string[]) => Temple | undefined;
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
  reminders: [],
  tones: [],
  wallpaperStyles: [],
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
  // Outside a provider nothing has been fetched, so there is nothing to
  // show — the same answer the provider gives before anything loads.
  deityList: [],
  templeList: [],
  deityName: (slug) => slug,
  deityById: () => undefined,
  templeById: () => undefined,
  deityImage: () => undefined,
  // Outside a provider there is no dashboard, so the bundled murti is it.
  deityArt: (id) => DEITY_IMAGES[id],
  bookingEnabled: () => true,
  // Outside a provider nothing has been fetched, so there is nothing.
  upcomingFestivals: () => [],
  templeRating: () => undefined,
  setting: (_k, fallback) => fallback,
  settingText: () => '',
  sevasFor: () => [],
});

/*
 * Turning dashboard rows into what the screens draw.
 *
 * The app's `Deity` and `Temple` carry rendering parameters the dashboard
 * may leave blank — a deity created there has a name long before anyone
 * picks its robe colour. These defaults are NOT content: they are how the
 * sanctum draws an unstyled record, and they apply whether or not demo
 * content is enabled. Falling back to a whole bundled *catalogue* is a
 * different thing, and that is what the flag controls.
 */
const DRAWN = {
  body: '#D9C7A7',
  robe: '#C8862F',
  accent: '#FFC13D',
  trim: '#E4572E',
  crown: 'plain' as CrownKind,
};

const TEMPLE_DRAWN = {
  backdrop: ['#2A1206', '#120703'] as [string, string],
  accent: '#FFC13D',
  trim: '#E4572E',
  idol: '#D9C7A7',
};

const CROWNS: CrownKind[] = ['jata', 'mukut', 'tall', 'plain'];
const asCrown = (v?: string): CrownKind =>
  CROWNS.includes(v as CrownKind) ? (v as CrownKind) : DRAWN.crown;

function toDeity(r: RemoteDeity, art?: ImageSourcePropType): Deity {
  return {
    id: r.slug,
    name: r.name,
    title: r.title ?? r.name,
    body: r.body || DRAWN.body,
    robe: r.robe || DRAWN.robe,
    accent: r.accent || DRAWN.accent,
    trim: r.trim || DRAWN.trim,
    crown: asCrown(r.crown),
    crescent: r.crescent,
    serpent: r.serpent,
    elephant: r.elephant,
    mace: r.mace,
    image: art,
    mark: r.mark ?? '',
    mantra: r.mantra ?? '',
    offerings: r.offerings ?? [],
  };
}

function toTemple(r: RemoteTemple, deity: Deity): Temple {
  return {
    id: r.slug,
    name: r.name,
    // The slug, not the deity object: `Temple.deity` is a reference, and
    // every consumer wanted the slug back out of it.
    deity: deity.id,
    mark: r.mark || deity.mark,
    location: r.location ?? '',
    aarti: r.aartiTime ?? '',
    offerings: r.offerings ?? [],
    backdrop: [
      r.backdropFrom || TEMPLE_DRAWN.backdrop[0],
      r.backdropTo || TEMPLE_DRAWN.backdrop[1],
    ],
    accent: r.accent || deity.accent || TEMPLE_DRAWN.accent,
    trim: r.trim || TEMPLE_DRAWN.trim,
    idol: r.idol || TEMPLE_DRAWN.idol,
    map: { x: r.mapX ?? 0, y: r.mapY ?? 0 },
    coords: { lat: r.lat ?? 0, lng: r.lng ?? 0 },
  };
}

/** Where the last good /api/content response is kept. */
const CACHE_KEY = 'pooja.content.v1';

const normalise = (data: Partial<Content> | null): Content => ({
  deities: data?.deities ?? [],
  temples: data?.temples ?? [],
  aartis: data?.aartis ?? [],
  festivals: data?.festivals ?? [],
  sevas: data?.sevas ?? [],
  knowledge: data?.knowledge ?? [],
  faqs: data?.faqs ?? [],
  hero: data?.hero ?? [],
  reminders: data?.reminders ?? [],
  tones: data?.tones ?? [],
  wallpaperStyles: data?.wallpaperStyles ?? [],
  settings: data?.settings ?? {},
  announcement: data?.announcement ?? null,
});

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

  const value = useMemo<ContentContextValue>(() => {
    const imageBySlug = new Map(
      content.deities.filter((d) => d.imageUrl).map((d) => [d.slug, d.imageUrl as string]),
    );
    const templeBySlug = new Map(content.temples.map((tpl) => [tpl.slug, tpl]));

    const artFor = (slug: string): ImageSourcePropType | undefined => {
      const url = assetUrl(imageBySlug.get(slug));
      return url ? { uri: url } : DEITY_IMAGES[slug];
    };

    /*
     * What the screens draw.
     *
     * The dashboard is the only source. Nothing is compiled into the app,
     * so an empty dashboard renders empty states — which is the honest
     * answer, and the one that makes the dashboard's emptiness visible
     * instead of hiding it behind a catalogue nobody can edit.
     */
    const deityList: Deity[] = content.deities.map((d) => toDeity(d, artFor(d.slug)));

    const deityBySlug = new Map(deityList.map((d) => [d.id, d]));

    const templeList: Temple[] = content.temples.map((t) =>
      toTemple(
        t,
        // A temple needs a deity to borrow its colours and mark from.
        (t.deitySlug && deityBySlug.get(t.deitySlug)) ||
          deityList[0] ||
          toDeity({ slug: t.deitySlug ?? '', name: '' }),
      ),
    );

    return {
      ...content,
      loading,
      deityList,
      templeList,
      deityName: (slug) => deityBySlug.get(slug)?.name ?? slug,
      deityById: (id) => {
        const key = Array.isArray(id) ? id[0] : id;
        return (key ? deityBySlug.get(key) : undefined) ?? deityList[0];
      },
      templeById: (id) => {
        const key = Array.isArray(id) ? id[0] : id;
        return templeList.find((tpl) => tpl.id === key) ?? templeList[0];
      },
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
        return remote;
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
