import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { Earnings } from '@/lib/api';
import { fill } from '@/lib/fill';
import { Radius, Space, Surface, useTheme } from '@/theme';

import { formatRupeesFromPaise as rs } from '../lib/money';

function HeroInner({ earnings, since }: { earnings: Earnings; since: string }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <LinearGradient
      colors={c.emberWash as unknown as [string, string, string]}
      style={styles.card}>
      <View style={styles.top}>
        <Type v="labelMd" tone="onSurfaceVariant">
          {t('am_earned_month')}
        </Type>
        <Type v="labelMd" tone="onSurfaceFaint">
          {fill(t('am_since'), { d: since })}
        </Type>
      </View>
      <Type v="numeral" numeric style={{ fontSize: 40 }}>
        {rs(earnings.month.earnedPaise)}
      </Type>
      <View style={styles.row}>
        {[
          [t('am_today'), earnings.today.earnedPaise],
          [t('am_paid'), earnings.paidPaise],
          [t('am_due'), earnings.duePaise],
        ].map(([k, v]) => (
          <View key={k as string} style={styles.cell}>
            <Type v="labelSm" tone="onSurfaceFaint">
              {k as string}
            </Type>
            <Type v="titleSm" numeric>
              {rs(v as number)}
            </Type>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

/** This month's earnings, with today / paid out / due underneath. Always the ember surface. */
export function EarningsHero({ earnings, since }: { earnings: Earnings; since: string }) {
  return (
    <Surface mode="sanctum">
      <View style={{ borderRadius: Radius.lg, overflow: 'hidden' }}>
        <HeroInner earnings={earnings} since={since} />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.md, gap: Space.xs },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: Space.sm, marginTop: Space.xs },
  cell: { flex: 1, gap: 2 },
});
