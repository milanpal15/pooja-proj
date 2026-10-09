import { StyleSheet, View } from 'react-native';

import { Button, Card, Coins, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { ChadhavaOrder } from '@/lib/api';
import { Space } from '@/theme';

import { canCancelOrder, orderStatusChip } from '../lib/status';
import { StatusChip } from './StatusChip';

/** One chadhava order in My Bookings. */
export function OrderRow({ order: o, onCancel }: { order: ChadhavaOrder; onCancel: () => void }) {
  const { t, lang } = useLanguage();
  const when = new Date(o.createdAt).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <Card style={[styles.card, { borderRadius: 20 }]}>
      <View style={styles.head}>
        <Type v="titleMd" style={{ flex: 1, fontSize: 15, lineHeight: 20 }} numberOfLines={2}>
          {o.listingTitle}
        </Type>
        <StatusChip chip={orderStatusChip(o.status)} />
      </View>
      <Type v="bodySm" tone="onSurfaceVariant">
        {o.items.map((i) => `${i.title} × ${i.qty}`).join(', ')}
      </Type>
      <Type v="labelSm" tone="onSurfaceFaint">
        {`${o.ref} · ${when}`}
      </Type>
      <View style={styles.foot}>
        <Coins value={o.totalCoins} tone="goldInk" word />
        {canCancelOrder(o) && <Button label={t('cancel')} size="sm" variant="outline" onPress={onCancel} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  head: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Space.sm },
});
