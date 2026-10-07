import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { TempleGlyph } from '@/components/pooja/temple-glyph';
import { Badge, Button, Card, Divider, Icon, Screen, Segmented, Type, useScrollPadding, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';

import { useLanguage } from '@/context/language';
import { type BookedPooja, cancelBooking, getBookedPoojas } from '@/lib/bookings';
import { Radius, Space, useTheme } from '@/theme';
import { useContent } from '@/context/content';

type FilterTab = 'all' | 'upcoming' | 'completed';

export default function MyPoojasScreen() {
  const { templeById } = useContent();
  const { c } = useTheme();
  const router = useRouter();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const scrollPad = useScrollPadding();

  const [bookings, setBookings] = useState<BookedPooja[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<FilterTab>('all');

  /*
   * A promise chain rather than `await` in an async function: it keeps
   * every setState in a later tick, which is what the effect below needs,
   * and `alive` stops a slow response writing to a screen already left.
   */
  const loadData = useCallback(
    (alive: () => boolean = () => true) =>
      getBookedPoojas()
        .then((data) => {
          if (!alive()) return;
          setBookings(data);
          setFailed(false);
        })
        .catch(() => {
          // An empty list and an unreachable temple look identical
          // otherwise, and "you have no bookings" is a bad thing to tell
          // someone wrongly.
          if (alive()) setFailed(true);
        })
        .finally(() => {
          if (!alive()) return;
          setLoading(false);
          setRefreshing(false);
        }),
    [],
  );

  useEffect(() => {
    let alive = true;
    loadData(() => alive);
    return () => {
      alive = false;
    };
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCancel = (b: BookedPooja) => {
    Alert.alert(t('cancel_confirm_title'), t('cancel_confirm_msg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cancel_booking'),
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelBooking(b.id);
          } catch {
            // The row is the server's now, so a failed cancel must not
            // disappear from the list as though it had worked.
            toast.error(t('booking_cancel_failed'));
            return;
          }
          setBookings((prev) => prev.filter((x) => x.id !== b.id));
          toast.success(t('booking_cancelled'));
        },
      },
    ]);
  };

  const upcomingCount = bookings.filter((b) => b.status === 'upcoming').length;
  const completedCount = bookings.filter((b) => b.status === 'completed').length;

  const filtered = bookings.filter((b) => {
    if (tab === 'upcoming') return b.status === 'upcoming';
    if (tab === 'completed') return b.status === 'completed';
    return true;
  });

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <Screen tabBar={false} watermark>
      <AppBar title={t('my_poojas_title')} />

      <View style={styles.filterWrap}>
        <Segmented<FilterTab>
          options={[
            { value: 'all', label: `${t('filter_all')} (${bookings.length})` },
            { value: 'upcoming', label: `${t('filter_upcoming')} (${upcomingCount})` },
            { value: 'completed', label: `${t('filter_completed')} (${completedCount})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, scrollPad]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gold} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyMedallion, { backgroundColor: c.accentContainer }]}>
                <Icon name="diya" size={48} color={c.primary} />
              </View>
              <Type v="headlineMd" tone="goldInk" center>
                {failed ? t('bookings_unavailable_title') : t('no_bookings_title')}
              </Type>
              <Type v="bodyMd" tone="onSurfaceVariant" center style={styles.emptyDesc}>
                {failed ? t('bookings_unavailable_desc') : t('no_bookings_desc')}
              </Type>
              {/* Retry when the list could not be read; browse when it is
                  genuinely empty. Offering "Book a Pooja" to someone whose
                  bookings merely failed to load hides the real problem. */}
              <Button
                label={failed ? t('retry') : t('book_a_pooja')}
                icon={failed ? undefined : 'temple'}
                size="md"
                onPress={() => (failed ? onRefresh() : router.push('/temples'))}
                style={styles.emptyCta}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const temple = templeById(item.templeId);
          const isUpcoming = item.status === 'upcoming';

          return (
            <Card variant="ornate" style={styles.bookingCard}>
              {/* Header: Temple info & status */}
              <View style={styles.cardHeader}>
                <View style={styles.templeSnippet}>
                  {/* The booking carries its own temple name, so a temple
                      the dashboard no longer lists still renders — just
                      without its glyph, rather than not at all. */}
                  {temple && (
                    <View style={styles.glyphBox}>
                      <TempleGlyph temple={temple} size={48} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Type v="titleMd" tone="goldInk">
                      {item.templeName}
                    </Type>
                    <View style={styles.locRow}>
                      <Icon name="mapPin" size={12} color={c.onSurfaceVariant} />
                      <Type v="labelSm" tone="onSurfaceVariant" numberOfLines={1}>
                        {item.templeLocation}
                      </Type>
                    </View>
                  </View>
                </View>

                <Badge
                  label={isUpcoming ? t('status_upcoming') : t('status_completed')}
                  tone={isUpcoming ? 'primary' : 'success'}
                />
              </View>

              <View style={{ marginVertical: Space.sm }}>
                <Divider gold />
              </View>

              {/* Seva Details */}
              <View style={styles.sevaRow}>
                <View style={{ flex: 1 }}>
                  <Type v="titleLg" tone="onSurface">
                    {item.sevaName}
                  </Type>
                  {!!item.sevaNameHi && (
                    <Type v="bodySm" tone="goldInk">
                      {item.sevaNameHi}
                    </Type>
                  )}
                </View>
                <Type v="titleLg" tone="primary" numeric>
                  ₹{item.totalAmount}
                </Type>
              </View>

              {/* Metadata Grid */}
              <View style={[styles.metaBox, { backgroundColor: c.containerLow }]}>
                <View style={styles.metaItem}>
                  <Type v="labelSm" tone="onSurfaceFaint">
                    {t('seva_date')}
                  </Type>
                  <Type v="bodyMd" style={{ fontWeight: '600' }}>
                    {formatDate(item.date)}
                  </Type>
                </View>

                <View style={styles.metaItem}>
                  <Type v="labelSm" tone="onSurfaceFaint">
                    {t('devotee_label')}
                  </Type>
                  <Type v="bodyMd">
                    {item.devoteeName} {item.gotra ? `(${item.gotra})` : ''}
                  </Type>
                </View>

                <View style={styles.metaItem}>
                  <Type v="labelSm" tone="onSurfaceFaint">
                    {t('prasad_status')}
                  </Type>
                  <View style={styles.prasadRow}>
                    <Icon
                      name={item.prasad ? 'gift' : 'close'}
                      size={14}
                      color={item.prasad ? c.gold : c.onSurfaceFaint}
                    />
                    <Type v="bodySm" tone={item.prasad ? 'goldInk' : 'onSurfaceFaint'}>
                      {item.prasad ? t('prasad_opted') : t('prasad_not_opted')}
                    </Type>
                  </View>
                </View>

                <View style={styles.metaItem}>
                  <Type v="labelSm" tone="onSurfaceFaint">
                    {t('booking_ref')}
                  </Type>
                  <Type v="labelSm" tone="onSurfaceVariant" style={{ fontFamily: 'monospace' }}>
                    {item.bookingRef}
                  </Type>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                {isUpcoming ? (
                  <>
                    <Button
                      label={t('cancel_booking')}
                      variant="outline"
                      size="sm"
                      onPress={() => handleCancel(item)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label={t('view_temple')}
                      icon="temple"
                      size="sm"
                      onPress={() =>
                        router.push({ pathname: '/temples', params: { search: item.templeName } })
                      }
                      style={{ flex: 1 }}
                    />
                  </>
                ) : (
                  <Button
                    label={t('book_a_pooja')}
                    icon="diya"
                    size="sm"
                    block
                    onPress={() =>
                      router.push({ pathname: '/booking', params: { temple: item.templeId } })
                    }
                  />
                )}
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterWrap: {
    paddingHorizontal: Space.margin,
    paddingVertical: Space.sm,
  },
  listContent: {
    paddingHorizontal: Space.margin,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  /*
   * `alignSelf` is the point of this, not the margin.
   *
   * A Button that is not `block` sets `alignSelf: 'flex-start'` so it does
   * not stretch to fill a column — which also overrides the centred
   * container around it, leaving the call to action hard against the left
   * edge under centred text.
   */
  emptyCta: {
    marginTop: Space.md,
    alignSelf: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  emptyMedallion: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  emptyDesc: {
    marginTop: 4,
    lineHeight: 20,
  },
  bookingCard: {
    padding: Space.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  templeSnippet: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  glyphBox: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sevaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  metaBox: {
    borderRadius: Radius.md,
    padding: Space.md,
    gap: Space.sm,
  },
  metaItem: {
    gap: 2,
  },
  prasadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
});
