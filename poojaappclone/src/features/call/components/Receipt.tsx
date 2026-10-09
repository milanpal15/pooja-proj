import { StyleSheet, View } from 'react-native';

import { Card, Divider, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { formatClockWords } from '../lib/words';
import { fill } from '@/lib/fill';
import { formatCoins } from '@/lib/format';

/** What happened and what it cost. Every figure is the server's. */
export function Receipt({
  seconds,
  minutes,
  rate,
  total,
  balance,
}: {
  seconds: number;
  minutes: number;
  rate: number;
  total: number;
  balance: number | null;
}) {
  const { t } = useLanguage();
  const rows: [string, string, boolean?][] = [
    [t('sum_connected_for'), formatClockWords(seconds, t('dur_min_sec'), t('dur_sec'))],
    [t('sum_minutes_charged'), fill(t('sum_minutes_val'), { n: minutes, rate: formatCoins(rate) })],
    [t('sum_total'), fill(t('start_balance_val'), { n: formatCoins(total) }), true],
    ...(balance === null
      ? []
      : ([[t('sum_balance_now'), fill(t('start_balance_val'), { n: formatCoins(balance) })]] as [
          string,
          string,
        ][])),
  ];
  return (
    <Card variant="sunken" style={styles.card}>
      {rows.map(([k, v, strong], i) => (
        <View key={k}>
          {i > 0 && <Divider />}
          <View style={styles.row}>
            <Type v="bodySm" tone="onSurfaceVariant" style={{ flex: 1 }}>
              {k}
            </Type>
            <Type v={strong ? 'titleMd' : 'labelLg'} tone={strong ? 'primary' : 'onSurface'} numeric>
              {v}
            </Type>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
});
