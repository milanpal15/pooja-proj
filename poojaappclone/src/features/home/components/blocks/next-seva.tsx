import { useLanguage } from '@/i18n';
import { placeLine } from '@/lib/place';
import { formatPoojaDate } from '@/lib/pooja-dates';

import { useSource } from '../../hooks/use-sources';
import { pick } from '../../lib/pick';
import { Frame } from '../Frame';
import { NextSeva } from '../NextSeva';
import { type BlockProps, useBlock } from './use-block';

/** The devotee's next booked pooja. Hidden when signed out, unreachable, or nothing is upcoming. */
export function NextSevaBlock({ block }: BlockProps) {
  const { t, lang } = useLanguage();
  const { follow } = useBlock(block);
  const feed = useSource('bookings.next', { params: {} });
  if (!feed.data) return null;

  const { booking: b, days } = feed.data;
  const hi = lang === 'hi';
  const when = days === 0 ? t('hv_today') : days === 1 ? t('hv_tomorrow') : formatPoojaDate(b.poojaDate, lang);
  const open = () => follow('/my-bookings');

  return (
    <Frame>
      <NextSeva
        title={t('hv_next_seva')}
        link={t('hv_my_bookings')}
        seed={b.poojaSlug}
        name={pick(hi, b.poojaTitle, b.poojaTitleHi)}
        line={[when, placeLine(b.templeName, b.place)].filter(Boolean).join(' · ')}
        status={t(b.status === 'sankalp' ? 'hv_st_sankalp' : 'hv_st_booked')}
        onLink={open}
        onOpen={open}
      />
    </Frame>
  );
}
