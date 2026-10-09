import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { formatCoins } from '@/lib/format';
import { fill } from '@/lib/fill';
import { Space, useTheme } from '@/theme';

/** Rate, balance and how long that balance lasts. */
export function CostBreakdown({
  rate,
  balance,
  minutes,
}: {
  rate: number;
  /** null while the wallet is still loading. */
  balance: number | null;
  minutes: number;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const rows: [string, string, boolean?][] = [
    [t('start_rate'), fill(t('start_rate_val'), { n: formatCoins(rate) })],
    [t('start_balance'), balance === null ? '…' : fill(t('start_balance_val'), { n: formatCoins(balance) })],
    [t('start_upto'), balance === null ? '…' : fill(t('start_upto_val'), { n: minutes }), true],
  ];
  return (
    <View style={[styles.box, { backgroundColor: c.containerLow }]}>
      {rows.map(([k, v, strong]) => (
        <View key={k} style={styles.row}>
          <Type v="bodySm" tone="onSurfaceVariant" style={{ flex: 1 }}>
            {k}
          </Type>
          <Type v={strong ? 'titleSm' : 'labelLg'} tone={strong ? 'primary' : 'onSurface'} numeric>
            {v}
          </Type>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, padding: Space.md, gap: Space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
