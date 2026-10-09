import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { PoojaDetail } from '@/lib/api';
import { pick } from '@/lib/localized';
import { placeLine } from '@/lib/place';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { useTheme } from '@/theme';

import { CountdownCard } from './CountdownCard';

/** Tagline, title, and the white place / date / countdown card. */
export function DetailHeader({ pooja: p, now }: { pooja: PoojaDetail; now: number }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const date = formatPoojaDate(p.poojaDate, lang) ?? t('ps_every_day');
  const place = placeLine(p.templeName, p.place);
  return (
    <View style={styles.wrap}>
      <View style={{ gap: 6 }}>
        {!!p.tagline && (
          <Type v="labelLg" tone="primary" style={{ fontSize: 13 }}>
            {pick(lang, p.tagline, p.taglineHi)}
          </Type>
        )}
        <Type v="headlineMd" style={styles.title}>
          {pick(lang, p.title, p.titleHi)}
        </Type>
      </View>

      <View style={[styles.info, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
        {!!place && (
          <View style={styles.row}>
            <Icon name="mapPin" size={18} color={c.primary} />
            <Type v="bodySm" style={{ flex: 1 }}>
              {place}
            </Type>
          </View>
        )}
        <View style={styles.row}>
          <Icon name="calendar" size={18} color={c.primary} />
          <Type v="bodySm" style={{ flex: 1 }}>
            {[date, p.tithi].filter(Boolean).join(' · ')}
          </Type>
        </View>
        <CountdownCard closesAt={p.bookingClosesAt} now={now} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '700' },
  info: { borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
