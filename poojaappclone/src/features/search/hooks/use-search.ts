import { useMemo } from 'react';

import { eventHref } from '@/features/events';
import { useLanguage } from '@/i18n';
import { fetchChadhavaListings, fetchEvents, fetchPoojas } from '@/lib/api';
import { useAdmin } from '@/providers/admin';
import { useContent } from '@/providers/content';

import {
  aartiEntries,
  chadhavaEntries,
  deityEntries,
  eventEntries,
  type Entry,
  festivalEntries,
  poojaEntries,
  templeEntries,
  topEntries,
} from '../lib/entries';
import { tokenize } from '../lib/normalize';
import { useRemoteOnce, useRemoteQuery } from './use-remote';

import type { IconName } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';

export const SECTION_LIMIT = 5;

export type SectionKind = 'poojas' | 'chadhava' | 'temples' | 'bhajans' | 'deities' | 'events' | 'festivals';

export type Section = {
  kind: SectionKind;
  titleKey: StringKey;
  icon: IconName;
  hits: Entry[];
  total: number;
  loading: boolean;
  /** Where "See all" goes, when a list screen exists and there is more than shown. */
  seeAll?: string;
};

const META: Record<SectionKind, { titleKey: StringKey; icon: IconName }> = {
  poojas: { titleKey: 'sr_sec_poojas', icon: 'diya' },
  chadhava: { titleKey: 'sr_sec_chadhava', icon: 'marigold' },
  temples: { titleKey: 'sr_sec_temples', icon: 'temple' },
  bhajans: { titleKey: 'sr_sec_bhajans', icon: 'music' },
  deities: { titleKey: 'sr_sec_deities', icon: 'lotus' },
  events: { titleKey: 'sr_sec_events', icon: 'sparkle' },
  festivals: { titleKey: 'sr_sec_festivals', icon: 'calendar' },
};

const allPoojas = () => fetchPoojas({});
const byQuery = (q: string) => fetchPoojas({ q });
const allListings = () => fetchChadhavaListings();

/**
 * Every source, matched against `query` (already debounced). Content-backed sections (temples,
 * aartis, deities, festivals) come from the cached content and work offline; poojas, chadhava
 * and events come from the API, each independently, so one slow or failed call never blocks or
 * hides another.
 */
export function useSearch(query: string) {
  const { lang } = useLanguage();
  const hi = lang === 'hi';
  const { flags } = useAdmin();
  const content = useContent();
  const { temples, aartis, deities, knowledge, deityName, upcomingFestivals, loading: contentLoading } = content;
  const active = tokenize(query).length > 0;
  const eventsOn = flags.events !== false;

  // The full lists are fetched once and filtered here (so temple / place words match too); the
  // server's own `q` answer for the typed text is merged in as well.
  const poojaAll = useRemoteOnce(allPoojas, true);
  const poojaServer = useRemoteQuery(query, byQuery, active);
  const chadhava = useRemoteOnce(allListings, true);
  const events = useRemoteOnce(fetchEvents, eventsOn);

  const sections = useMemo<Section[]>(() => {
    if (!active) return [];
    const q = query;
    const out: Section[] = [];
    const add = (
      kind: SectionKind,
      entries: Entry[],
      loading: boolean,
      seeAll: (q: string) => string | undefined,
      extras: Entry[] = [],
    ) => {
      const { hits, total } = topEntries(entries, q, SECTION_LIMIT, extras);
      out.push({ kind, ...META[kind], hits, total, loading: loading && hits.length === 0, seeAll: total > hits.length ? seeAll(q) : undefined });
    };

    add(
      'poojas',
      poojaEntries(poojaAll.data?.poojas, hi),
      poojaAll.loading || poojaServer.loading,
      (s) => `/poojas?q=${encodeURIComponent(s.trim())}`,
      poojaEntries(poojaServer.data?.poojas, hi),
    );
    add('chadhava', chadhavaEntries(chadhava.data?.listings, hi), chadhava.loading, () => '/chadhava');
    add('temples', templeEntries(temples, deityName), contentLoading && !temples.length, (s) => `/temples?search=${encodeURIComponent(s.trim())}`);
    add('bhajans', aartiEntries(aartis, deityName), contentLoading && !aartis.length, () => '/bhajan');
    add('deities', deityEntries(deities, knowledge, hi), contentLoading && !deities.length, () => undefined);
    if (eventsOn) {
      const s = events.data?.sections;
      const cards = s ? [...s.continue, ...s.thisWeek, ...s.upcoming, ...s.mine] : [];
      add('events', eventEntries(cards, hi, (slug) => eventHref(slug) as string), events.loading, () => '/events');
    }
    add('festivals', festivalEntries(upcomingFestivals(200), deityName, hi), false, () => '/festivals');
    return out;
  }, [active, query, hi, poojaAll, poojaServer, chadhava, events, eventsOn, temples, aartis, deities, knowledge, deityName, upcomingFestivals, contentLoading]);

  const failed = active && (poojaAll.failed || poojaServer.failed || chadhava.failed || (eventsOn && events.failed));
  const visible = sections.filter((s) => s.hits.length > 0 || s.loading);
  const pending = sections.some((s) => s.loading);
  return { sections: visible, failed, pending, none: active && !pending && visible.length === 0 };
}
