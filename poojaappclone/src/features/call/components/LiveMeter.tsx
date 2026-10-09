import { StyleSheet, View } from 'react-native';

import { Card, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { formatCoins } from '@/lib/format';
import { Space } from '@/theme';

/** Rate / Used / Left — all numbers come from the server's last poll. */
export function LiveMeter({
  rate,
  used,
  left,
}: {
  rate: number;
  used: number;
  /** null when the wallet has not reported yet. */
  left: number | null;
}) {
  const { t } = useLanguage();
  const cells: [string, string, string][] = [
    [t('call_rate'), formatCoins(rate), t('call_unit_permin')],
    [t('call_used'), formatCoins(used), t('call_unit_coins')],
    [t('call_left'), left === null ? '–' : formatCoins(left), t('call_unit_coins')],
  ];
  return (
    <Card variant="glass" style={styles.card}>
      {cells.map(([label, value, unit]) => (
        <View key={label} style={styles.cell} accessible accessibilityLabel={`${label} ${value} ${unit}`}>
          <Type v="labelSm" tone="onSurfaceVariant">
            {label}
          </Type>
          <Type v="titleLg" numeric>
            {value}
            <Type v="labelMd" tone="onSurfaceVariant">{` ${unit}`}</Type>
          </Type>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: Space.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
});
