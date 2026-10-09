import { useMemo } from 'react';

import { useLanguage } from '@/i18n';
import type { Booking, PoojaCard } from '@/lib/api';
import { fill } from '@/lib/format';
import { placeLine } from '@/lib/place';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { assetUrl } from '@/providers/content';

import { useNow } from '../hooks/use-now';
import { pickFeaturedPooja } from '../lib/featured';
import { pickNextSeva } from '../lib/next-seva';
import { FeaturedPooja } from './FeaturedPooja';
import { NextSeva } from './NextSeva';
import { Skeleton } from './Skeleton';

const hiOr = (hi: boolean, en: string, h?: string) => (hi && h?.trim() ? h : en);

/** The festival promo card from the nearest festival pooja. Hidden when there is none. */
export function FeaturedBlock({
  poojas,
  festivalHi,
  loading,
  onOpen,
}: {
  poojas: PoojaCard[] | undefined;
  /** festival slug -> Hindi name, from the poojas response's filters. */
  festivalHi: Record<string, string>;
  loading: boolean;
  onOpen: (path: string) => void;
}) {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';
  const now = useNow(60_000);
  const pick = useMemo(() => pickFeaturedPooja(poojas ?? [], now), [poojas, now]);

  if (loading && !poojas) return <Skeleton style={{ height: 220, borderRadius: 22 }} />;
  if (!pick) return null;

  const { pooja: p, days } = pick;
  const festival = hiOr(hi, p.festivalName, festivalHi[p.festivalSlug]) || p.title;
  const chip = fill(t(days === 0 ? 'hv_begins_today' : days === 1 ? 'hv_begins_tomorrow' : 'hv_begins_days'), { festival, n: days });
  const when = formatPoojaDate(p.poojaDate, lang);

  return (
    <FeaturedPooja
      seed={p.slug}
      uri={assetUrl(p.banner)}
      chip={chip}
      title={hiOr(hi, p.title, p.titleHi)}
      line={[placeLine(p.templeName, p.place), when].filter(Boolean).join(' · ')}
      cta={fill(t('hv_book_named'), { name: festival })}
      onPress={() => onOpen(`/pooja/${encodeURIComponent(p.slug)}`)}
    />
  );
}

/** The devotee's next booked pooja. Hidden when signed out, unreachable, or nothing is upcoming. */
export function NextSevaBlock({ bookings, onOpen }: { bookings: Booking[] | undefined; onOpen: (path: string) => void }) {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';
  const now = useNow(60_000);
  const pick = useMemo(() => pickNextSeva(bookings ?? [], now), [bookings, now]);
  if (!pick) return null;

  const { booking: b, days } = pick;
  const when = days === 0 ? t('hv_today') : days === 1 ? t('hv_tomorrow') : formatPoojaDate(b.poojaDate, lang);
  return (
    <NextSeva
      title={t('hv_next_seva')}
      link={t('hv_my_bookings')}
      seed={b.poojaSlug}
      name={hiOr(hi, b.poojaTitle, b.poojaTitleHi)}
      line={[when, placeLine(b.templeName, b.place)].filter(Boolean).join(' · ')}
      status={t(b.status === 'sankalp' ? 'hv_st_sankalp' : 'hv_st_booked')}
      onLink={() => onOpen('/my-bookings')}
      onOpen={() => onOpen('/my-bookings')}
    />
  );
}
