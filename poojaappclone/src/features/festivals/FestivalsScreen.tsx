import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Screen, SectionBand, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { EmptyFestivals } from './components/EmptyFestivals';
import { FestivalRow } from './components/FestivalRow';
import { useFestivalGroups } from './hooks/use-festival-groups';

/**
 * The full vrat & festival calendar — where Home's "See all dates" goes.
 *
 * That footer was rendered but had no handler, so it looked tappable and did
 * nothing. Home shows the next two dates; this shows the rest, grouped by
 * month so a devotee can plan further than a fortnight ahead.
 *
 * Past dates are dropped rather than greyed: a calendar of things that have
 * already happened is a different screen, and nobody asked for it.
 */
export function FestivalsScreen() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { deityArt } = useContent();
  const hi = lang === 'hi';
  const groups = useFestivalGroups(hi);

  return (
    <Screen tabBar={false}>
      <AppBar title={hi ? 'व्रत एवं त्योहार' : 'Vrat & Festivals'} tinted />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {groups.length === 0 ? (
          <EmptyFestivals hi={hi} />
        ) : (
          groups.map((g) => (
            <SectionBand key={g.month} title={g.month} tone="crimson">
              <View style={{ gap: Space.sm }}>
                {g.items.map((f) => (
                  <FestivalRow
                    key={f.id}
                    festival={f}
                    hi={hi}
                    art={deityArt(f.deity)}
                    onPress={() => router.push({ pathname: '/pooja', params: { deity: f.deity } })}
                  />
                ))}
              </View>
            </SectionBand>
          ))
        )}

        <Type v="labelSm" tone="onSurfaceFaint" center style={styles.note}>
          {hi
            ? 'तिथियाँ स्थानीय पंचांग के अनुसार भिन्न हो सकती हैं।'
            : 'Dates may vary slightly by regional panchang.'}
        </Type>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg, paddingBottom: Space.xxl },
  note: { paddingTop: Space.xs },
});
