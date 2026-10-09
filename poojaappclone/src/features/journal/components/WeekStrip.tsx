import { Pressable, StyleSheet, View } from 'react-native';

import { Card, IconButton, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import type { WeekDay } from '../lib/week';

export function WeekStrip({
  monthLabel,
  week,
  onShift,
  onSelectDay,
}: {
  monthLabel: string;
  week: WeekDay[];
  onShift: (weeks: number) => void;
  onSelectDay: (d: Date) => void;
}) {
  const { c } = useTheme();
  return (
    <Card variant="sunken">
      <View style={styles.monthRow}>
        <IconButton name="back" label="Previous week" size={32} onPress={() => onShift(-1)} />
        <Type v="titleMd">{monthLabel}</Type>
        <IconButton name="forward" label="Next week" size={32} onPress={() => onShift(1)} />
      </View>
      <View style={styles.week}>
        {week.map((w) => (
          <Pressable
            key={w.key}
            accessibilityRole="button"
            accessibilityLabel={w.date.toDateString()}
            accessibilityState={{ selected: !!w.active, disabled: w.future }}
            // A day that has not happened cannot be journalled.
            disabled={w.future}
            onPress={() => onSelectDay(w.date)}
            style={({ pressed }) => [styles.day, pressed && { opacity: 0.6 }]}>
            <Type v="labelSm" tone="onSurfaceFaint">
              {w.d}
            </Type>
            <View
              style={[
                styles.dayNum,
                w.active && { backgroundColor: c.primary },
                // Today stays findable once the devotee browses away from it.
                !w.active && w.today && { borderWidth: 1, borderColor: c.gold },
                w.future && { opacity: 0.35 },
              ]}>
              <Type v="titleSm" color={w.active ? c.onPrimary : c.onSurface}>
                {w.n}
              </Type>
            </View>
            <View style={[styles.dot, { backgroundColor: w.dot ? c.gold : 'transparent' }]} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
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
});
