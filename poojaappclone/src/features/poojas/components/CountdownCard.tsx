import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

import { countdownTo } from '../lib/countdown';

const two = (n: number) => String(n).padStart(2, '0');

/** "Time left to book" — four boxes, ticking. Nothing at all when there is no deadline. */
export function CountdownCard({ closesAt, now }: { closesAt: string | null; now: number }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const left = countdownTo(closesAt, now);
  if (!left) return null;

  if (left.closed) {
    return (
      <View style={[styles.box, { backgroundColor: c.container }]}>
        <Type v="labelLg" tone="error" center>
          {t('ps_booking_closed')}
        </Type>
      </View>
    );
  }

  const cells = [
    [two(left.days), t('ps_unit_days')],
    [two(left.hours), t('ps_unit_hrs')],
    [two(left.minutes), t('ps_unit_min')],
    [two(left.seconds), t('ps_unit_sec')],
  ];
  return (
    <View style={styles.wrap} accessibilityRole="timer">
      <Type v="labelMd" tone="onSurfaceVariant">
        {t('ps_time_left')}
      </Type>
      <View style={styles.row}>
        {cells.map(([n, label]) => (
          <View key={label} style={[styles.cell, { backgroundColor: c.accentContainer }]}>
            <Type v="titleMd" tone="onAccentContainer" numeric>
              {n}
            </Type>
            <Type v="labelSm" tone="onAccentContainer">
              {label}
            </Type>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: Space.sm },
  cell: { flex: 1, height: 44, borderRadius: Radius.md, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: Radius.md, padding: Space.sm + 4 },
});
