import { ScrollView, StyleSheet } from 'react-native';

import { Button, IconButton, Screen } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { JournalField } from './components/JournalField';
import { MalaCounter } from './components/MalaCounter';
import { WeekStrip } from './components/WeekStrip';
import { useJournal } from './hooks/use-journal';

/**
 * Daily Spiritual Journal.
 *
 * Two things the export got wrong and this fixes:
 *
 *  1. The japa counter was a plain bordered circle — it looked identical at 0
 *     and at 108, so it showed no progress at all. It is now a real arc with
 *     the "burning wick" ember DESIGN.md asks for, against a 108 mala target.
 *  2. The tinted header used white-on-saffron at roughly 2:1. `AppBar tinted`
 *     puts dark ink on the accent container instead.
 *
 * Entries are still local state — persistence lands with `/v1/journal/:day`
 * (defect 12 in the design doc). The screen is ready for it; the API isn't.
 */
export function JournalScreen() {
  const { t } = useLanguage();
  const j = useJournal();

  return (
    <Screen tabBar={false}>
      <AppBar
        title={t('journal_title')}
        tinted
        right={
          <IconButton
            name="calendar"
            label="Go to today"
            size={40}
            onPress={() => j.selectDay(new Date())}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <WeekStrip
          monthLabel={j.monthLabel}
          week={j.week}
          onShift={j.shiftWeeks}
          onSelectDay={j.selectDay}
        />

        <MalaCounter
          count={j.count}
          progress={j.progress}
          caption={t('mantras_chanted')}
          onMinus={() => j.setCount((n) => Math.max(0, n - 1))}
          onPlus={() => j.setCount((n) => n + 1)}
        />

        <JournalField
          title={t('daily_gratitude')}
          icon="diya"
          value={j.gratitude}
          onChangeText={j.setGratitude}
          placeholder={t('grateful_ph')}
        />

        <JournalField
          title={t('spiritual_notes')}
          icon="lotus"
          value={j.notes}
          onChangeText={j.setNotes}
          placeholder={t('reflect_ph')}
          multilineRows={4}
        />

        <Button label={t('save')} icon="check" size="lg" block onPress={j.saveEntry} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },
});
