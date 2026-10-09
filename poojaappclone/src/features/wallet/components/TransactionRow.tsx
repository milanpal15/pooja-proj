import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { WalletTxn } from '@/lib/api';
import { formatCoins } from '@/lib/format';
import { Space, useTheme } from '@/theme';

import { signedAmount, txnLabelKey } from '../lib/transactions';

/** One ledger line. Credits are green, debits red — and signed, so colour is not the only cue. */
export function TransactionRow({ txn, last }: { txn: WalletTxn; last: boolean }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const credit = txn.amount >= 0;
  const when = new Date(txn.at).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View
      accessible
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Type v="titleSm" numberOfLines={1}>
          {t(txnLabelKey(txn.type))}
          {txn.note ? ` · ${txn.note}` : ''}
        </Type>
        <Type v="labelSm" tone="onSurfaceFaint">
          {when}
        </Type>
      </View>
      <Type v="titleSm" tone={credit ? 'success' : 'error'} numeric>
        {signedAmount(txn.amount, formatCoins)}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm + 4, paddingVertical: 12 },
});
