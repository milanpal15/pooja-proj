/**
 * SOURCES — the resolver table behind every source-bound block
 * (docs/HOME_LAYOUT.md §3). Each key maps to a hook that reads the feed the app
 * already uses for that thing, honours the block's `params` and `limit`, and
 * returns `{loading, data}`. A block mounts only the resolver it is bound to,
 * so a layout without (say) events never calls the events API.
 *
 * Hooks here are stable per block instance (BlockList keys a block by its
 * id, type and source), so choosing one by key does not change hook order.
 */
import { useMemo } from 'react';

import type { Deity } from '@/constants/deities';
import { useLiveList } from '@/features/darshan';
import type { ImageSourcePropType } from 'react-native';
import { useEventsTeaserFeeds } from './sources-events';
import { useLanguage } from '@/i18n';
import type { Astrologer, Booking, PoojaCard } from '@/lib/api';
import { fill, formatCoins } from '@/lib/format';
import { byDistanceFrom, formatDistance } from '@/lib/geo';
import { placeLine } from '@/lib/place';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { useSavedTemples } from '@/lib/saved-temples';
import { RASHIS, type Rashi } from '@/features/horoscope';
import { assetUrl, type RemoteAarti, useContent } from '@/providers/content';
import { useAuth } from '@/providers/auth';

import { isSourceKey, type SourceKey } from '../lib/block-meta';
import { pickFeaturedPooja } from '../lib/featured';
import type { ViewItem } from '../lib/layout-types';
import { pickNextSeva } from '../lib/next-seva';
import { pick } from '../lib/pick';
import type { HomeSlide } from '../types';
import { useGrantedLocation } from '@/hooks/use-granted-location';
import { useHomeAstrologers, useHomeBookings, useHomeChadhava, useHomePoojas } from './use-home-feeds';
import { useHomeSlides } from './use-home-slides';
import { useNow } from './use-now';
import { type PanchangView, usePanchangView } from './use-panchang-view';
import { deityForWeekday } from '../lib/weekday-deity';

export type Args = { params: Record<string, unknown>; limit?: number };
export type Feed<T> = { loading: boolean; data: T };

/** A price card for the "photo3" shelf of poojas / chadhava (the existing MiniCard). */
export type OfferCard = { seed: string; uri?: string; title: string; line: string; price?: string; chip?: string; bannerH?: number };
export type ShelfEntry = { key: string; item: ViewItem; card?: OfferCard };

export type NearTemple = { id: string; name: string; location: string; km?: number; distance?: string };
export type DailyData = {
  deity?: { id: string; name: string; accent: string; art: ImageSourcePropType | undefined };
  panchang: PanchangView | null;
};

type SourceData = {
  hero: HomeSlide[];
  deities: Deity[];
  'poojas.featured': { pick: { pooja: PoojaCard; days: number } | null; festivalHi: Record<string, string>; entries: ShelfEntry[] };
  'poojas.upcoming': ShelfEntry[];
  'chadhava.listings': ShelfEntry[];
  'temples.near_me': NearTemple[];
  'temples.saved': ShelfEntry[];
  'festivals.upcoming': ShelfEntry[];
  'events.upcoming': ShelfEntry[];
  'events.mine': ShelfEntry[];
  'bookings.next': { booking: Booking; days: number } | null;
  'astrologers.online': Astrologer[] | undefined;
  'panchang.today': PanchangView | null;
  'horoscope.today': Rashi[];
  'bhajans.featured': { aartis: RemoteAarti[]; entries: ShelfEntry[] };
  knowledge: ShelfEntry[];
  'daily.today': DailyData;
  'live.now': ShelfEntry[];
};

const enc = encodeURIComponent;
const DEFAULT_SHELF_LIMIT = 8;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

function item(key: string, p: Partial<ViewItem>): ViewItem {
  return { key, title: '', subtitle: '', icon: '', image: '', badge: '', liveBadge: false, deitySlug: '', href: '', flag: '', ...p };
}

/* ─────────────────────────────────────────────────────────── resolvers ── */

function useHero({ limit }: Args): Feed<HomeSlide[]> {
  const slides = useHomeSlides();
  return { loading: false, data: limit ? slides.slice(0, limit) : slides };
}

function useDeities({ limit }: Args): Feed<Deity[]> {
  const { deityList } = useContent();
  return { loading: false, data: limit ? deityList.slice(0, limit) : deityList };
}

function usePoojaEntries(rows: PoojaCard[] | undefined, limit: number): ShelfEntry[] {
  const { t, lang } = useLanguage();
  return useMemo(() => {
    const hi = lang === 'hi';
    return (rows ?? []).slice(0, limit).map((p) => {
      const title = pick(hi, p.title, p.titleHi);
      const line = [placeLine(p.templeName, p.place), formatPoojaDate(p.poojaDate, lang)].filter(Boolean).join(' · ');
      const uri = assetUrl(p.banner);
      const href = `/pooja/${enc(p.slug)}`;
      return {
        key: p.slug,
        item: item(p.slug, { title, subtitle: line, image: uri ?? '', href }),
        card: { seed: p.slug, uri, title, line, price: fill(t('hv_from_coins'), { n: formatCoins(p.fromCoins) }) },
      };
    });
  }, [rows, limit, lang, t]);
}

function usePoojasUpcoming({ params, limit }: Args): Feed<ShelfEntry[]> {
  const q = useHomePoojas();
  const temple = text(params.temple);
  const rows = useMemo(() => (q.data?.poojas ?? []).filter((p) => !temple || p.templeSlug === temple), [q.data, temple]);
  return { loading: q.status === 'loading' && !q.data, data: usePoojaEntries(rows, limit ?? DEFAULT_SHELF_LIMIT) };
}

function usePoojasFeatured({ params }: Args): Feed<SourceData['poojas.featured']> {
  const q = useHomePoojas();
  const now = useNow(60_000);
  const temple = text(params.temple);
  const rows = useMemo(() => (q.data?.poojas ?? []).filter((p) => !temple || p.templeSlug === temple), [q.data, temple]);
  const found = useMemo(() => pickFeaturedPooja(rows, now), [rows, now]);
  const entries = usePoojaEntries(found ? [found.pooja] : [], 1);
  const festivalHi = useMemo(() => Object.fromEntries((q.data?.filters.festivals ?? []).map((f) => [f.slug, f.nameHi ?? ''])), [q.data]);
  return { loading: q.status === 'loading' && !q.data, data: { pick: found, festivalHi, entries } };
}

function useChadhavaListings({ params, limit }: Args): Feed<ShelfEntry[]> {
  const { t, lang } = useLanguage();
  const q = useHomeChadhava();
  const category = text(params.category);
  const n = limit ?? DEFAULT_SHELF_LIMIT;
  const data = useMemo(() => {
    const hi = lang === 'hi';
    return (q.data?.listings ?? [])
      .filter((l) => !category || l.category === category)
      .slice(0, n)
      .map((l) => {
        const title = pick(hi, l.title, l.titleHi);
        const line = placeLine(l.templeName, l.place);
        const uri = assetUrl(l.banner);
        return {
          key: l.slug,
          item: item(l.slug, { title, subtitle: line, image: uri ?? '', href: `/chadhava/${enc(l.slug)}` }),
          card: { seed: l.slug, uri, title, line, bannerH: 96, price: fill(t('hv_from_coins'), { n: formatCoins(l.fromCoins) }) },
        };
      });
  }, [q.data, category, n, lang, t]);
  return { loading: q.status === 'loading' && !q.data, data };
}

/** Ranked by distance only when location was ALREADY granted (Home never asks); else the dashboard's order. */
function useTemplesNear({ limit }: Args): Feed<NearTemple[]> {
  const { lang } = useLanguage();
  const { templeList } = useContent();
  const here = useGrantedLocation();
  const n = limit ?? 2;
  const data = useMemo(() => {
    const ranked = here
      ? byDistanceFrom(here, templeList.filter((x) => x.coords.lat))
      : templeList.map((x) => ({ ...x, km: undefined as number | undefined }));
    return ranked.slice(0, n).map((x) => ({
      id: x.id,
      name: x.name,
      location: x.location,
      km: x.km,
      distance: x.km !== undefined ? formatDistance(x.km, lang === 'hi' ? 'hi' : 'en') : undefined,
    }));
  }, [templeList, here, n, lang]);
  return { loading: false, data };
}

function useTemplesSaved({ limit }: Args): Feed<ShelfEntry[]> {
  const { user } = useAuth();
  const { templeList } = useContent();
  const { savedIds, loading } = useSavedTemples();
  const n = limit ?? DEFAULT_SHELF_LIMIT;
  const data = useMemo(
    () =>
      user
        ? templeList
            .filter((x) => savedIds.includes(x.id))
            .slice(0, n)
            .map((x) => ({ key: x.id, item: item(x.id, { title: x.name, subtitle: x.location, href: '/saved-temples' }) }))
        : [],
    [user, templeList, savedIds, n],
  );
  return { loading: !!user && loading, data };
}

function useFestivalsUpcoming({ limit }: Args): Feed<ShelfEntry[]> {
  const { upcomingFestivals } = useContent();
  const { lang } = useLanguage();
  const n = limit ?? DEFAULT_SHELF_LIMIT;
  const data = useMemo(
    () =>
      upcomingFestivals(n).map((f) => ({
        key: f.id,
        item: item(f.id, { title: pick(lang === 'hi', f.name, f.nameHi), subtitle: formatPoojaDate(f.date, lang) ?? '', href: '/festivals' }),
      })),
    [upcomingFestivals, n, lang],
  );
  return { loading: false, data };
}

function useEventsUpcoming({ params, limit }: Args): Feed<ShelfEntry[]> {
  return useEventsTeaserFeeds('upcoming', params, limit ?? DEFAULT_SHELF_LIMIT);
}

function useEventsMine({ params, limit }: Args): Feed<ShelfEntry[]> {
  return useEventsTeaserFeeds('mine', params, limit ?? DEFAULT_SHELF_LIMIT);
}

function useBookingsNext(): Feed<SourceData['bookings.next']> {
  const q = useHomeBookings();
  const now = useNow(60_000);
  const found = useMemo(() => pickNextSeva(q.data ?? [], now), [q.data, now]);
  return { loading: false, data: found };
}

function useAstrologersOnline(): Feed<Astrologer[] | undefined> {
  const q = useHomeAstrologers();
  return { loading: q.status === 'loading', data: q.data };
}

function usePanchangToday(): Feed<PanchangView | null> {
  return { loading: false, data: usePanchangView(useGrantedLocation()) };
}

function useHoroscopeToday({ limit }: Args): Feed<Rashi[]> {
  return { loading: false, data: RASHIS.slice(0, limit ?? 4) };
}

function useBhajansFeatured({ limit }: Args): Feed<SourceData['bhajans.featured']> {
  const { aartis } = useContent();
  const data = useMemo(() => {
    const entries = aartis.slice(0, limit ?? DEFAULT_SHELF_LIMIT).map((a) => ({
      key: a._id,
      item: item(a._id, { title: a.title, subtitle: a.artist ?? '', href: '/bhajan' }),
    }));
    return { aartis, entries };
  }, [aartis, limit]);
  return { loading: false, data };
}

function useKnowledge({ limit }: Args): Feed<ShelfEntry[]> {
  const { knowledge, deityById } = useContent();
  const n = limit ?? 3;
  const data = useMemo(
    () =>
      knowledge
        .filter((k) => {
          const d = deityById(k.deitySlug);
          return !!d && d.id === k.deitySlug;
        })
        .slice(0, n)
        .map((k) => ({ key: k.deitySlug, item: item(k.deitySlug, { deitySlug: k.deitySlug, href: '/knowledge' }) })),
    [knowledge, deityById, n],
  );
  return { loading: false, data };
}

function useDailyToday(): Feed<DailyData> {
  const { deityList, deityArt } = useContent();
  const panchang = usePanchangView(useGrantedLocation());
  const deity = deityForWeekday(deityList, new Date().getDay());
  return {
    loading: false,
    data: { deity: deity && { id: deity.id, name: deity.name, accent: deity.accent, art: deityArt(deity.id) }, panchang },
  };
}

/** Temples live right now (`/api/live`): a card per stream with a LIVE chip; none live = an empty list (the block hides). */
function useLiveNow({ limit }: Args): Feed<ShelfEntry[]> {
  const { t, lang } = useLanguage();
  const q = useLiveList();
  const n = limit ?? DEFAULT_SHELF_LIMIT;
  const data = useMemo(() => {
    const hi = lang === 'hi';
    return (q.data?.streams ?? [])
      .filter((s) => s.state === 'live')
      .slice(0, n)
      .map((s) => {
        const title = pick(hi, s.templeName, s.templeNameHi);
        const line = s.currentAarti ? pick(hi, s.currentAarti.name, s.currentAarti.nameHi) : s.place;
        const uri = assetUrl(s.cover);
        const href = `/darshan/${enc(s.slug)}`;
        return {
          key: s.slug,
          item: item(s.slug, { title, subtitle: line, image: uri ?? '', href, liveBadge: true }),
          card: { seed: s.slug, uri, title, line, bannerH: 96, chip: t('hv_live') },
        };
      });
  }, [q.data, n, lang, t]);
  return { loading: q.loading && !q.data, data };
}

/** Source key -> resolver hook. Typed so a key added to `SOURCE_AUTH` without a resolver fails the typecheck. */
export const SOURCES: { [K in SourceKey]: (args: Args) => Feed<SourceData[K]> } = {
  hero: useHero,
  deities: useDeities,
  'poojas.featured': usePoojasFeatured,
  'poojas.upcoming': usePoojasUpcoming,
  'chadhava.listings': useChadhavaListings,
  'temples.near_me': useTemplesNear,
  'temples.saved': useTemplesSaved,
  'festivals.upcoming': useFestivalsUpcoming,
  'events.upcoming': useEventsUpcoming,
  'events.mine': useEventsMine,
  'bookings.next': useBookingsNext,
  'astrologers.online': useAstrologersOnline,
  'panchang.today': usePanchangToday,
  'horoscope.today': useHoroscopeToday,
  'bhajans.featured': useBhajansFeatured,
  knowledge: useKnowledge,
  'daily.today': useDailyToday,
  'live.now': useLiveNow,
};

/** Resolve one source by key. The key must not change over the caller's lifetime (BlockList remounts on a change). */
export function useSource<K extends SourceKey>(key: K, args: Args): Feed<SourceData[K]> {
  const useResolver = SOURCES[key] as (a: Args) => Feed<SourceData[K]>;
  return useResolver(args);
}

export { isSourceKey };
export type { SourceData };
