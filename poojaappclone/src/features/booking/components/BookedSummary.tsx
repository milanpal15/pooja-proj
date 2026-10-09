import { StyleSheet, View } from 'react-native';

import { Card, Divider, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { Booking } from '@/lib/api';
import { fill, formatCoins } from '@/lib/format';
import { pick } from '@/lib/localized';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { placeLine } from '@/lib/place';
import { Space } from '@/theme';

/** What was booked, for whom, and what it cost — all from the server's record. */
export function BookedSummary({ booking: b, balance }: { booking: Booking; balance: number | null }) {
  const { t, lang } = useLanguage();
  const date = formatPoojaDate(b.poojaDate, lang) ?? t('ps_every_day');
  const rows: [string, string][] = [
    [t('ps_k_package'), `${b.packageName} · ${b.persons === 1 ? t('ps_persons_one') : fill(t('ps_persons_n'), { n: b.persons })}`],
    [t('ps_k_names'), b.names.map((n) => n.name).join(', ')],
    [t('ps_k_prasad'), b.prasad ? t('ps_included') : '—'],
  ];
  return (
    <Card style={styles.card}>
      <Type v="titleSm" style={{ fontSize: 15, lineHeight: 20 }}>
        {pick(lang, b.poojaTitle, b.poojaTitleHi)}
      </Type>
      <Type v="labelMd" tone="onSurfaceVariant" style={{ fontWeight: '400' }}>
        {[placeLine(b.templeName, b.place), date].filter(Boolean).join(' · ')}
      </Type>
      <View style={{ gap: 6, marginTop: Space.sm }}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Type v="bodySm" tone="onSurfaceVariant">
              {k}
            </Type>
            <Type v="labelMd" style={styles.v}>
              {v}
            </Type>
          </View>
        ))}
      </View>
      <Divider />
      <View style={{ gap: 6 }}>
        <View style={styles.kv}>
          <Type v="labelLg" style={{ flex: 1 }}>
            {t('ps_paid')}
          </Type>
          <Type v="labelLg" tone="primary">{`${formatCoins(b.totalCoins)} ${t('coins_word')}`}</Type>
        </View>
        {balance != null && (
          <View style={styles.kv}>
            <Type v="bodySm" tone="onSurfaceVariant" style={{ flex: 1 }}>
              {t('ps_bal_left')}
            </Type>
            <Type v="labelLg">{`${formatCoins(balance)} ${t('coins_word')}`}</Type>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, borderRadius: 20, borderWidth: 0 },
  kv: { flexDirection: 'row', gap: Space.md },
  v: { flex: 1, textAlign: 'right' },
});
