import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { Earnings } from '@/lib/api';
import { fill } from '@/lib/fill';
import { useTheme } from '@/theme';

import { dayOf, formatRupeesFromPaise } from '../lib/money';

export function PayoutRow({ payout }: { payout: Earnings['payouts'][number] }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.row, { borderBottomColor: c.outlineVariant }]}>
      <View style={{ flex: 1 }}>
        <Type v="titleSm" numeric>
          {formatRupeesFromPaise(payout.amountPaise)}
        </Type>
        <Type v="bodySm" tone="onSurfaceVariant">
          {[dayOf(payout.paidAt), payout.reference ? fill(t('am_ref'), { r: payout.reference }) : '']
            .filter(Boolean)
            .join(' · ')}
        </Type>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
});
