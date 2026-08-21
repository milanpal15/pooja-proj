import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  Field,
  Icon,
  IconButton,
  ProgressRing,
  Screen,
  Type,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

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

const MALA = 108;

const WEEK = [
  { d: 'SUN', n: 23, dot: true },
  { d: 'MON', n: 24, dot: true },
  { d: 'TUE', n: 25, dot: true },
  { d: 'WED', n: 26, active: true },
  { d: 'THU', n: 27 },
  { d: 'FRI', n: 28 },
  { d: 'SAT', n: 29 },
];

export default function JournalScreen() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const [count, setCount] = useState(108);
  const [gratitude, setGratitude] = useState('');
  const [notes, setNotes] = useState('');

  // One full mala per revolution, so 216 reads as two complete rounds.
  const progress = (count % MALA) / MALA || (count > 0 ? 1 : 0);

  return (
    <Screen tabBar={false}>
      <AppBar
        title={t('journal_title')}
        tinted
        right={<IconButton name="calendar" label="Pick a date" size={40} />}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Week strip */}
        <Card variant="sunken">
          <View style={styles.monthRow}>
            <IconButton name="back" label="Previous month" size={32} />
            <Type v="titleMd">OCT 2023</Type>
            <IconButton name="forward" label="Next month" size={32} />
          </View>
          <View style={styles.week}>
            {WEEK.map((w) => (
              <Pressable
                key={w.d}
                accessibilityRole="button"
                accessibilityState={{ selected: !!w.active }}
                style={styles.day}>
                <Type v="labelSm" tone="onSurfaceFaint">
                  {w.d}
                </Type>
                <View
                  style={[
                    styles.dayNum,
                    w.active && { backgroundColor: c.primary },
                  ]}>
                  <Type v="titleSm" color={w.active ? c.onPrimary : c.onSurface}>
                    {w.n}
                  </Type>
                </View>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: w.dot ? c.gold : 'transparent' },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Japa counter */}
        <View style={styles.counterWrap}>
          <ProgressRing progress={progress} size={244} thickness={9}>
            <View style={styles.counterInner}>
              <Type v="bodyMd" tone="onSurfaceVariant">
                {t('mantras_chanted')}
              </Type>
              <View style={styles.counterRow}>
                <RoundBtn
                  icon="minus"
                  label="One less"
                  onPress={() => setCount((n) => Math.max(0, n - 1))}
                />
                <Type v="numeral" numeric>
                  {count}
                </Type>
                <RoundBtn icon="plus" label="One more" onPress={() => setCount((n) => n + 1)} />
              </View>
              <Type v="labelSm" tone="goldInk">
                ॐ नमः शिवाय
              </Type>
            </View>
          </ProgressRing>
          <Type v="labelSm" tone="onSurfaceFaint">
            {Math.floor(count / MALA)} mala · {count % MALA}/{MALA}
          </Type>
        </View>

        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Type v="titleLg">{t('daily_gratitude')}</Type>
            <Icon name="diya" size={22} color={c.gold} />
          </View>
          <Field
            value={gratitude}
            onChangeText={setGratitude}
            placeholder={t('grateful_ph')}
          />
        </View>

        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Type v="titleLg">{t('spiritual_notes')}</Type>
            <Icon name="lotus" size={22} color={c.gold} />
          </View>
          <Field
            value={notes}
            onChangeText={setNotes}
            placeholder={t('reflect_ph')}
            multilineRows={4}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function RoundBtn({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Icon name={icon} size={20} color={c.onAccent} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },

  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 4 },
  dayNum: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 3 },

  counterWrap: { alignItems: 'center', gap: Space.sm },
  counterInner: { alignItems: 'center', gap: 6 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  field: { gap: Space.sm },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
