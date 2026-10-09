import { StyleSheet, View } from 'react-native';

import { Card, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

/** Calls · minutes · missed for today. `null` renders an en dash, never a made-up zero. */
export function TodayStats({
  calls,
  minutes,
  missed,
}: {
  calls: number | null;
  minutes: number | null;
  missed: number | null;
}) {
  const { t } = useLanguage();
  const cells: [string, number | null][] = [
    [t('am_calls_today'), calls],
    [t('am_minutes'), minutes],
    [t('am_missed'), missed],
  ];
  return (
    <View style={styles.row}>
      {cells.map(([label, n]) => (
        <Card key={label} variant="sunken" style={styles.cell}>
          <Type v="headlineMd" numeric center>
            {n === null ? '–' : String(n)}
          </Type>
          <Type v="labelSm" tone="onSurfaceVariant" center numberOfLines={1}>
            {label}
          </Type>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.sm },
  cell: { flex: 1, gap: 2, alignItems: 'center' },
});
