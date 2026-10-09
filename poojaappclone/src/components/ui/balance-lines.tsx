/**
 * `BalanceLines` — "Your balance" and "Balance after payment" under a bill,
 * or "You need N more coins" when the balance does not cover it. Hidden while
 * the balance is still unknown, rather than showing a made-up zero.
 */

import { StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n';
import { balanceAfter, shortBy } from '@/lib/coin-bill';
import { fill } from '@/lib/format';
import { Space } from '@/theme';

import { Coins } from './coins';
import { Type } from './type';

export function BalanceLines({ balance, total }: { balance: number | null; total: number }) {
  const { t } = useLanguage();
  if (balance == null) return null;
  const short = shortBy(balance, total);
  const after = balanceAfter(balance, total);
  return (
    <View style={styles.wrap}>
      <Line label={t('ps_bal_before')} value={balance} />
      {short === 0 && after != null ? (
        <Line label={t('ps_bal_after')} value={after} />
      ) : (
        <Type v="labelMd" tone="error">
          {fill(t('ps_short_by'), { n: short })}
        </Type>
      )}
    </View>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.line}>
      <Type v="bodySm" tone="onSurfaceVariant" style={{ flex: 1 }}>
        {label}
      </Type>
      <Coins value={value} size="sm" trailing />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Space.sm, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
