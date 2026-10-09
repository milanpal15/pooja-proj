import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Screen, Segmented, useScrollPadding, useToast } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { OrderRow } from './components/OrderRow';
import { PoojaBookingRow } from './components/PoojaBookingRow';
import { RateSheet } from './components/RateSheet';
import { useCancelBooking, useCancelOrder } from './hooks/use-cancel';
import { useMyBookings } from './hooks/use-my-bookings';

type Tab = 'poojas' | 'chadhava';

/** Pooja bookings and chadhava orders, with cancel and rate. `?tab=chadhava` opens the second. */
export function MyBookingsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const toast = useToast();
  const scrollPad = useScrollPadding();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'chadhava' ? 'chadhava' : 'poojas');
  const [rating, setRating] = useState<string | null>(null);
  const { poojas, orders } = useMyBookings();

  const cancelPooja = useCancelBooking(poojas.reload);
  const cancelOrder = useCancelOrder(orders.reload);
  const list = poojas.data ?? [];
  const orderList = orders.data ?? [];

  return (
    <Screen tabBar={false} watermark>
      <AppBar title={t('ps_mb_title')} leftTitle />
      <View style={styles.seg}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'poojas', label: t('ps_mb_poojas') },
            { value: 'chadhava', label: t('ps_mb_chadhava') },
          ]}
        />
      </View>

      {tab === 'poojas' ? (
        <AsyncState
          status={poojas.status}
          hasData={!!poojas.data}
          onRetry={poojas.reload}
          empty={list.length === 0}
          emptyTitle={t('ps_mb_empty_p')}
          emptyBody={t('ps_mb_empty_p_body')}
          emptyAction={<Button label={t('ps_mb_browse')} size="sm" onPress={() => router.push('/poojas')} />}
          skeletonHeight={130}>
          <FlatList
            data={list}
            keyExtractor={(b) => b.id}
            contentContainerStyle={[styles.list, scrollPad]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <PoojaBookingRow
                booking={item}
                onOpen={() => router.push({ pathname: '/booked', params: { id: item.id } })}
                onCancel={() => cancelPooja(item.id, item.totalCoins)}
                onRate={() => setRating(item.id)}
              />
            )}
          />
        </AsyncState>
      ) : (
        <AsyncState
          status={orders.status}
          hasData={!!orders.data}
          onRetry={orders.reload}
          empty={orderList.length === 0}
          emptyTitle={t('ps_mb_empty_c')}
          emptyBody={t('ps_mb_empty_c_body')}
          emptyAction={<Button label={t('ps_mb_browse_c')} size="sm" onPress={() => router.push('/chadhava')} />}
          skeletonHeight={110}>
          <FlatList
            data={orderList}
            keyExtractor={(o) => o.id}
            contentContainerStyle={[styles.list, scrollPad]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <OrderRow order={item} onCancel={() => cancelOrder(item.id, item.totalCoins)} />}
          />
        </AsyncState>
      )}

      <RateSheet
        bookingId={rating}
        onClose={() => setRating(null)}
        onDone={() => {
          setRating(null);
          toast.success(t('ps_rate_thanks'));
          poojas.reload();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  seg: { paddingHorizontal: Space.md, paddingVertical: Space.sm },
  list: { paddingHorizontal: Space.md, paddingTop: Space.sm, gap: Space.md },
});
