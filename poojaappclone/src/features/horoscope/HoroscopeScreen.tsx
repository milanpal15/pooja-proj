import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Screen } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { RashiHeader } from './components/RashiHeader';
import { RashiPicker } from './components/RashiPicker';
import { ReadingSection } from './components/ReadingSection';
import { useRashi } from './hooks/use-rashi';
import { useReadings } from './hooks/use-readings';

/**
 * Rashifal — the daily reading.
 *
 * Unlike the panchang next door, **none of this is computable**. A prediction
 * is somebody's words, so every reading is authored in the dashboard and
 * fetched for the day. When nothing is published the screen says so; it never
 * generates a reading, because a devotee making a decision on invented text
 * is a worse outcome than an empty screen.
 *
 * The chosen sign is remembered locally. Nothing asks for a date of birth —
 * that is personal data the app has no use for.
 */
export function HoroscopeScreen() {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';

  const { rashi, pick, current } = useRashi();
  const { readings, failed } = useReadings();

  const reading = useMemo(() => readings?.find((r) => r.rashi === rashi), [readings, rashi]);

  const today = new Date().toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen tabBar={false}>
      <AppBar title={t('rashifal')} subtitle={today.toUpperCase()} tinted />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <RashiPicker hi={hi} selectedId={rashi} onPick={pick} />
        <RashiHeader hi={hi} rashi={current} />
        <ReadingSection hi={hi} readings={readings} reading={reading} failed={failed} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg, paddingBottom: Space.xxl },
});
