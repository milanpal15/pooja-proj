import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, Screen, SectionBand, Type } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { type Festival } from '@/constants/home';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

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

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `YYYY-MM-DD` → local Date, avoiding the UTC shift `new Date(str)` applies. */
function parseDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthLabel(iso: string, hi: boolean) {
  const d = parseDay(iso);
  if (hi) return d.toLocaleDateString('hi-IN', { month: 'long', year: 'numeric' });
  return `${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
}

function dayLabel(iso: string, hi: boolean) {
  const d = parseDay(iso);
  return d.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function FestivalsScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { lang } = useLanguage();
  // Same source as Home: admin calendar first, bundled list as fallback.
  const { deityArt, upcomingFestivals } = useContent();
  const hi = lang === 'hi';

  /** Upcoming only, grouped by month, each group in date order. */
  const groups = useMemo(() => {
    // A high limit rather than a page: this list is a calendar year at most.
    const upcoming = upcomingFestivals(200);

    const out: { month: string; items: Festival[] }[] = [];
    for (const f of upcoming) {
      const label = monthLabel(f.date, hi);
      const last = out[out.length - 1];
      if (last && last.month === label) last.items.push(f);
      else out.push({ month: label, items: [f] });
    }
    return out;
  }, [hi, upcomingFestivals]);

  return (
    <Screen tabBar={false}>
      <AppBar title={hi ? 'व्रत एवं त्योहार' : 'Vrat & Festivals'} tinted />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {groups.length === 0 ? (
          <Card variant="sunken" style={styles.empty}>
            <Type v="titleMd" center>
              {hi ? 'कोई आगामी तिथि नहीं' : 'No upcoming dates'}
            </Type>
            <Type v="bodySm" tone="onSurfaceVariant" center>
              {hi
                ? 'नया पंचांग जुड़ते ही तिथियाँ यहाँ दिखेंगी।'
                : 'Dates will appear here once the new calendar is published.'}
            </Type>
          </Card>
        ) : (
          groups.map((g) => (
            <SectionBand key={g.month} title={g.month} tone="crimson">
              <View style={{ gap: Space.sm }}>
                {g.items.map((f) => (
                  <Card
                    key={f.id}
                    variant="sunken"
                    style={styles.row}
                    accessibilityLabel={hi ? f.nameHi : f.name}
                    // Straight into that deity's aarti — the thing a devotee
                    // actually wants on the day.
                    onPress={() => router.push({ pathname: '/pooja', params: { deity: f.deity } })}>
                    {deityArt(f.deity) ? (
                      <Image
                        source={deityArt(f.deity)!}
                        style={styles.art}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={[styles.art, styles.artFallback, { borderColor: c.goldHairline }]}>
                        <Type v="titleMd" tone="goldInk">
                          ॐ
                        </Type>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Type v="titleSm" numberOfLines={2}>
                        {hi ? f.nameHi : f.name}
                      </Type>
                      <Type v="labelSm" tone="primary">
                        {dayLabel(f.date, hi)}
                      </Type>
                    </View>
                  </Card>
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
  empty: { alignItems: 'center', gap: Space.xs, paddingVertical: Space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  art: { width: 48, height: 48, borderRadius: Radius.sm },
  artFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  note: { paddingTop: Space.xs },
});
