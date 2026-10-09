import { ScrollView, StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n';
import type { ChadhavaListingCard, PoojaCard } from '@/lib/api';
import { fill, formatCoins } from '@/lib/format';
import { placeLine } from '@/lib/place';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { assetUrl } from '@/providers/content';

import { MINI_W, MiniCard } from './MiniCard';
import { SectionHead } from './SectionHead';
import { Skeleton } from './Skeleton';

type Props<T> = { items: T[] | undefined; loading: boolean; onOpen: (path: string) => void };

const pickText = (hi: boolean, en: string, h: string) => (hi && h.trim() ? h : en);

function Shelf({ title, link, onLink, loading, children }: { title: string; link: string; onLink: () => void; loading: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      <SectionHead title={title} link={link} onLink={onLink} />
      {loading ? <Skeleton style={{ height: 190, width: MINI_W }} /> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {children}
        </ScrollView>
      )}
    </View>
  );
}

/** "Upcoming poojas": the open poojas, soonest first. Omitted when there are none or the API is down. */
export function PoojaShelf({ items, loading, onOpen }: Props<PoojaCard>) {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';
  if (!loading && !items?.length) return null;
  return (
    <Shelf title={t('hv_upcoming_poojas')} link={t('hv_see_all')} onLink={() => onOpen('/poojas')} loading={loading}>
      {(items ?? []).slice(0, 8).map((p) => (
        <MiniCard
          key={p.slug}
          seed={p.slug}
          uri={assetUrl(p.banner)}
          title={pickText(hi, p.title, p.titleHi)}
          line={[placeLine(p.templeName, p.place), formatPoojaDate(p.poojaDate, lang)].filter(Boolean).join(' · ')}
          price={fill(t('hv_from_coins'), { n: formatCoins(p.fromCoins) })}
          onPress={() => onOpen(`/pooja/${encodeURIComponent(p.slug)}`)}
        />
      ))}
    </Shelf>
  );
}

/** "Offer chadhava": the live listings. Omitted when there are none or the API is down. */
export function ChadhavaShelf({ items, loading, onOpen }: Props<ChadhavaListingCard>) {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';
  if (!loading && !items?.length) return null;
  return (
    <Shelf title={t('hv_chadhava_title')} link={t('hv_see_all')} onLink={() => onOpen('/chadhava')} loading={loading}>
      {(items ?? []).slice(0, 8).map((l) => (
        <MiniCard
          key={l.slug}
          seed={l.slug}
          uri={assetUrl(l.banner)}
          bannerH={96}
          title={pickText(hi, l.title, l.titleHi)}
          line={placeLine(l.templeName, l.place)}
          price={fill(t('hv_from_coins'), { n: formatCoins(l.fromCoins) })}
          onPress={() => onOpen(`/chadhava/${encodeURIComponent(l.slug)}`)}
        />
      ))}
    </Shelf>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { gap: 12, paddingRight: 4 },
});

/** Both offer rows, fed by the Home feeds. */
export function OfferShelves({
  poojas,
  chadhava,
  onOpen,
}: {
  poojas: { data?: { poojas: PoojaCard[] }; status: string };
  chadhava: { data?: { listings: ChadhavaListingCard[] }; status: string };
  onOpen: (path: string) => void;
}) {
  return (
    <>
      <PoojaShelf items={poojas.data?.poojas} loading={poojas.status === 'loading' && !poojas.data} onOpen={onOpen} />
      <ChadhavaShelf items={chadhava.data?.listings} loading={chadhava.status === 'loading' && !chadhava.data} onOpen={onOpen} />
    </>
  );
}
