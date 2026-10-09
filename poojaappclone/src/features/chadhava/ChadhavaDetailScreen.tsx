import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ReadMore, Screen, Type } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { MediaBanner } from '@/components/ui/media-banner';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';
import { placeLine } from '@/lib/place';
import { Saffron, Space } from '@/theme';

import { CartBar } from './components/CartBar';
import { HowRow } from './components/HowRow';
import { HowSheet } from './components/HowSheet';
import { OfferingCard } from './components/OfferingCard';
import { useListing } from './hooks/use-listings';
import { bump, type Cart, cartCount, cartTotal, encodeCart } from './lib/cart';
import { dayLabel } from './lib/window';

/** One listing: intro, "how it works", the offerings and the sticky cart bar. */
export function ChadhavaDetailScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const m = useListing(String(slug ?? ''));
  const l = m.data;
  const [cart, setCart] = useState<Cart>({});
  const [how, setHow] = useState(false);

  const a = dayLabel(l?.startsAt, lang);
  const b = dayLabel(l?.endsAt, lang);
  const window = a && b ? fill(t('cs_window'), { a, b }) : a || b;
  const intro = l ? pick(lang, l.intro, l.introHi) : '';

  return (
    <Screen tabBar={false}>
      <AppBar title={t('cs_title')} leftTitle />
      <AsyncState status={m.status} hasData={!!l} onRetry={m.reload} skeletonHeight={200}>
        {l ? (
          <>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={{ marginHorizontal: 16 }}>
                <MediaBanner
                  uri={l.gallery[0] || l.banner}
                  title={pick(lang, l.title, l.titleHi)}
                  height={170}
                  titleSize={22}
                  radius={20}
                />
              </View>
              <View style={styles.pad}>
                <Type v="headlineMd" style={{ fontSize: 18, lineHeight: 24, fontWeight: '700' }}>
                  {pick(lang, l.title, l.titleHi)}
                </Type>
                <Type v="labelMd" tone="primary" style={{ fontWeight: '400', fontSize: 12.5 }}>
                  {[placeLine(l.templeName, l.place), window].filter(Boolean).join(' · ')}
                </Type>
                <ReadMore text={[intro, t('cs_each_note')].filter(Boolean).join(' ')} v="bodySm" lines={3} style={{ lineHeight: 20 }} threshold={120} />
                {l.howItWorks.length > 0 && <HowRow label={t('cs_how')} onPress={() => setHow(true)} />}
                <View style={styles.sub}>
                  <View style={styles.bar} />
                  <Type v="titleSm" style={{ fontSize: 15 }}>
                    {t('cs_choose_h')}
                  </Type>
                </View>
                <View style={{ gap: 14 }}>
                  {l.offerings.map((o) => (
                    <OfferingCard
                      key={o.key}
                      offering={o}
                      qty={cart[o.key] ?? 0}
                      onChange={(d) => setCart((c) => bump(c, o.key, d))}
                    />
                  ))}
                </View>
                <Type v="labelSm" tone="onSurfaceFaint">
                  {t('cs_limit')}
                </Type>
              </View>
            </ScrollView>
            <CartBar
              count={cartCount(cart)}
              coins={cartTotal(l.offerings, cart)}
              onContinue={() =>
                router.push({ pathname: '/chadhava/confirm', params: { slug: l.slug, items: encodeCart(cart) } })
              }
            />
            <HowSheet visible={how} onClose={() => setHow(false)} steps={l.howItWorks} />
          </>
        ) : null}
      </AsyncState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 100 },
  pad: { padding: Space.md, paddingTop: 14, gap: Space.sm + 4 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Space.md },
  bar: { width: 4, height: 18, borderRadius: 2, backgroundColor: Saffron[400] },
});
