import { ScrollView, StyleSheet } from 'react-native';

import { Screen } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { AboutCard } from './components/AboutCard';
import { DayStepper } from './components/DayStepper';
import {
  FiveLimbsSection,
  MonthSection,
  MuhurtaSection,
  SunSection,
} from './components/PanchangSections';
import { usePanchangDay } from './hooks/use-panchang-day';
import { usePanchangPlace } from './hooks/use-panchang-place';

/**
 * The daily panchang.
 *
 * Everything here is computed on the device — see `lib/panchang.ts`. There is
 * no backend call and no editorial content, so it works with no network, and
 * it cannot go stale the way the hardcoded festival list did.
 *
 * Location matters: sunrise, and therefore every inauspicious window derived
 * from it, moves by the hour across India. The screen asks for the device's
 * position and says plainly which place the numbers are for, falling back to
 * Kashi rather than refusing to render.
 *
 * A temple can **override** any of it from the dashboard, because panchang is
 * not only astronomy — traditions differ on the tithi, and a temple may
 * observe its own sunrise. Overrides are merged field by field, so a temple
 * correcting the tithi alone keeps every computed value around it, and the
 * screen says when it is showing a temple's figures rather than its own.
 */
export function PanchangScreen() {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';

  const place = usePanchangPlace(hi);
  const { offset, setOffset, date, p, override, overridden, show, own } = usePanchangDay(place, hi);

  const dayLabel = date.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const section = { p, hi, show, own };

  return (
    <Screen tabBar={false}>
      <AppBar title={t('panchang')} subtitle={place.label.toUpperCase()} tinted />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <DayStepper
          dayLabel={dayLabel}
          hi={hi}
          offset={offset}
          onShift={(delta) => setOffset((o) => o + delta)}
          onToday={() => setOffset(0)}
        />
        <FiveLimbsSection {...section} />
        <SunSection {...section} />
        <MuhurtaSection {...section} />
        <MonthSection {...section} />
        <AboutCard hi={hi} overridden={overridden} override={override} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg, paddingBottom: Space.xxl },
});
