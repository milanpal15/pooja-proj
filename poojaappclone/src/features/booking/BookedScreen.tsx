import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, Type } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';
import { formatStamp } from '@/lib/pooja-dates';
import { useWallet } from '@/providers/wallet';
import { Radius, Saffron, Space, useTheme } from '@/theme';

import { BookedSummary } from './components/BookedSummary';
import { StatusTimeline } from './components/StatusTimeline';
import { useBooking } from './hooks/use-booking';
import { useCancelBooking } from './hooks/use-cancel';

/**
 * The booking's receipt and live status. Reached right after paying
 * (`/booked?id=`) and from My Bookings — one screen, the server's record.
 */
export function BookedScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const { balance } = useWallet();
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useBooking(String(id ?? ''));
  const b = m.data;
  const cancel = useCancelBooking(m.reload);

  const share = () => {
    if (!b) return;
    // Text only — no invented link.
    Share.share({
      message: fill(t('ps_share_booking'), { title: pick(lang, b.poojaTitle, b.poojaTitleHi), ref: b.bookingRef }),
    }).catch(() => {});
  };

  return (
    <Screen tabBar={false}>
      <LinearGradient colors={[c.successContainer, c.surface]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <AppBar back onBack={() => router.dismissTo('/my-bookings')} />
      <AsyncState status={m.status} hasData={!!b} onRetry={m.reload} skeletonHeight={180}>
        {b ? (
          <>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.hero}>
                <View style={[styles.badge, { backgroundColor: c.success }]}>
                  <Icon name="check" size={32} color="#FFFFFF" strokeWidth={2.8} />
                </View>
                <Type v="headlineMd" center accessibilityRole="header" style={{ fontSize: 21, fontWeight: '700' }}>
                  {t('ps_booked_title')}
                </Type>
                <Type v="labelMd" tone="onSurfaceVariant" center selectable style={{ fontWeight: '400', fontSize: 13 }}>
                  {t('ps_ref_label')} <Type v="labelMd" style={{ fontWeight: '700', fontSize: 13 }}>{b.bookingRef}</Type>
                </Type>
              </View>

              <BookedSummary booking={b} balance={balance} />

              <Type v="titleMd" accessibilityRole="header" style={{ marginTop: Space.sm }}>
                {t('ps_status_h')}
              </Type>
              <StatusTimeline booking={b} />

              {b.canCancel && (
                <View style={[styles.note, { backgroundColor: c.accentContainer }]}>
                  <Type v="labelMd" tone="onAccentContainer" style={{ fontWeight: '400', lineHeight: 18 }}>
                    {fill(t('ps_cancel_note'), { when: formatStamp(b.cancelBy, lang) })}
                  </Type>
                </View>
              )}
              {b.canCancel && (
                <Button label={t('ps_cancel_btn')} variant="outline" block onPress={() => cancel(b.id, b.totalCoins)} />
              )}

              <View style={styles.actions}>
                <Button label={t('ps_view_booking')} block style={{ flex: 1 }} onPress={() => router.dismissTo('/my-bookings')} />
                <Pressable accessibilityRole="button" onPress={share} style={[styles.share, { borderColor: Saffron[400] }]}>
                  <Type v="labelLg" tone="primary">
                    {t('ps_share')}
                  </Type>
                </Pressable>
              </View>
            </ScrollView>

          </>
        ) : null}
      </AsyncState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.md, gap: Space.md, paddingBottom: Space.xl },
  hero: { alignItems: 'center', gap: 8 },
  note: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: Space.sm },
  share: { flex: 1, height: 52, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 64, height: 64, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
});
