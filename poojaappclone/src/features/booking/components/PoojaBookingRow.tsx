import { StyleSheet, View } from 'react-native';

import { Button, Card, Coins, Stars, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { Booking } from '@/lib/api';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { placeLine } from '@/lib/place';
import { Space } from '@/theme';

import { poojaStatusChip } from '../lib/status';
import { StatusChip } from './StatusChip';

type Props = {
  booking: Booking;
  onOpen: () => void;
  onCancel: () => void;
  onRate: () => void;
};

/** One pooja booking in My Bookings, with Cancel / Rate when the server allows. */
export function PoojaBookingRow({ booking: b, onOpen, onCancel, onRate }: Props) {
  const { t, lang } = useLanguage();
  const date = formatPoojaDate(b.poojaDate, lang) ?? t('ps_every_day');
  return (
    <Card onPress={onOpen} accessibilityLabel={pick(lang, b.poojaTitle, b.poojaTitleHi)} style={[styles.card, { borderRadius: 20 }]}>
      <View style={styles.head}>
        <Type v="titleMd" style={{ flex: 1, fontSize: 15, lineHeight: 20 }} numberOfLines={2}>
          {pick(lang, b.poojaTitle, b.poojaTitleHi)}
        </Type>
        <StatusChip chip={poojaStatusChip(b.status)} />
      </View>
      <Type v="bodySm" tone="onSurfaceVariant">
        {[placeLine(b.templeName, b.place), date].filter(Boolean).join(' · ')}
      </Type>
      <Type v="bodySm" tone="onSurfaceVariant">
        {`${b.packageName} · ${b.persons === 1 ? t('ps_persons_one') : fill(t('ps_persons_n'), { n: b.persons })} · ${b.bookingRef}`}
      </Type>
      <View style={styles.foot}>
        <Coins value={b.totalCoins} tone="goldInk" word />
        <View style={styles.actions}>
          {b.review && <Stars value={b.review.rating} size={14} />}
          {b.canReview && <Button label={t('ps_rate')} size="sm" variant="secondary" onPress={onRate} />}
          {b.canCancel && <Button label={t('cancel')} size="sm" variant="outline" onPress={onCancel} />}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  head: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
