import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { placeLine } from '@/lib/place';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { assetUrl } from '@/providers/content';

import { useSource } from '../../hooks/use-sources';
import { sourceLimit, sourceParams } from '../../lib/layout';
import { pick } from '../../lib/pick';
import { FeaturedPooja } from '../FeaturedPooja';
import { Frame } from '../Frame';
import { Skeleton } from '../Skeleton';
import { type BlockProps, useBlock } from './use-block';

/** The nearest festival pooja as a promo card. Hidden when there is none. */
export function FeaturedPoojaBlock({ block }: BlockProps) {
  const { t, lang } = useLanguage();
  const { go } = useBlock(block);
  const hi = lang === 'hi';
  const feed = useSource('poojas.featured', { params: sourceParams(block), limit: sourceLimit(block) });
  const { pick: found, festivalHi } = feed.data;

  if (feed.loading) {
    return (
      <Frame>
        <Skeleton style={{ height: 220, borderRadius: 22 }} />
      </Frame>
    );
  }
  if (!found) return null;

  const { pooja: p, days } = found;
  const festival = pick(hi, p.festivalName, festivalHi[p.festivalSlug]) || p.title;
  const chip = fill(t(days === 0 ? 'hv_begins_today' : days === 1 ? 'hv_begins_tomorrow' : 'hv_begins_days'), { festival, n: days });

  return (
    <Frame>
      <FeaturedPooja
        seed={p.slug}
        uri={assetUrl(p.banner)}
        chip={chip}
        title={pick(hi, p.title, p.titleHi)}
        line={[placeLine(p.templeName, p.place), formatPoojaDate(p.poojaDate, lang)].filter(Boolean).join(' · ')}
        cta={fill(t('hv_book_named'), { name: festival })}
        onPress={() => go(`/pooja/${encodeURIComponent(p.slug)}`)}
      />
    </Frame>
  );
}
