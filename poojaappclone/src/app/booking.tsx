import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { RazorpayCheckout } from '@/components/payment/razorpay-checkout';
import { TempleGlyph } from '@/components/pooja/temple-glyph';
import {
  Button,
  Card,
  Chip,
  Divider,
  Field,
  Icon,
  NoContent,
  Screen,
  Type,
  useToast,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { PRASAD_DELIVERY, type Seva } from '@/constants/poojas';

import { useAdmin } from '@/context/admin';
import { useAuth } from '@/context/auth';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';
import { createBooking } from '@/lib/bookings';

/**
 * Pooja Booking — a priest performs a seva at the physical temple, on a date
 * you choose, in your name.
 *
 * This is NOT the Virtual Pooja screen. Until now the temple card's "Book
 * Pooja" button routed to `/pooja`, the on-device gesture aarti, so tapping
 * it never booked anything. The two are separate products with separate
 * gates: Virtual Pooja is free, instant and controlled by the global
 * `virtualPooja` flag; booking is paid, scheduled, and controlled per-temple
 * from the admin dashboard, because it depends on an arrangement with each
 * temple's administration.
 */
export default function BookingScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const { user } = useAuth();
  const { flags, logPayment } = useAdmin();
  const { bookingEnabled, setting, sevasFor, templeById } = useContent();

  const { temple: templeId } = useLocalSearchParams<{ temple?: string }>();
  const temple = templeById(templeId);

  /*
   * Rites and prices come from the dashboard, with the bundled catalogue as
   * the offline fallback. They were compiled into the app, so a price change
   * used to need a store release.
   */
  const sevas = useMemo(
    () => sevasFor({ templeSlug: temple?.id, deitySlug: temple?.deity }),
    [sevasFor, temple?.id, temple?.deity],
  );
  /** Courier fee, also admin-set; the bundled constant is the fallback. */
  const prasadFee = setting('prasadDelivery', PRASAD_DELIVERY);
  const dates = useMemo(() => nextDays(7), []);

  const [seva, setSeva] = useState<Seva | undefined>(sevas[0]);
  const [day, setDay] = useState(dates[0].iso);
  const [name, setName] = useState(user?.name ?? '');
  const [gotra, setGotra] = useState('');
  const [prasad, setPrasad] = useState(true);
  const [payOpen, setPayOpen] = useState(false);

  /*
   * Every hook above runs unconditionally; the guards start here. With the
   * bundled catalogue gone there may be no temple at all — an unfilled
   * dashboard — and a booking screen for a temple that does not exist is
   * worse than saying so.
   */
  const total = (seva?.price ?? 0) + (prasad ? prasadFee : 0);
  const allowed = !!temple && bookingEnabled(temple.id);
  const canBook = allowed && !!seva && !!name.trim();

  const onPay = () => {
    if (!flags.payments) {
      toast.info(t('payments_off'), { description: t('payments_off_msg') });
      return;
    }
    setPayOpen(true);
  };

  // Also guarded on `seva`: a temple with no rites published cannot take a
  // booking, and every control below assumes one is selected.
  if (!temple || !seva) {
    return (
      <Screen tabBar={false}>
        <AppBar title={t('book_pooja_title')} />
        <NoContent hi={lang === 'hi'} />
      </Screen>
    );
  }

  return (
    <Screen tabBar={false}>
      <AppBar title={t('book_pooja_title')} subtitle={temple.name.toUpperCase()} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Temple */}
        <Card>
          <View style={styles.templeRow}>
            <View style={styles.glyphWrap}>
              <TempleGlyph temple={temple} size={64} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Type v="labelSm" tone="onSurfaceFaint">
                {t('performed_at')}
              </Type>
              <Type v="titleMd">{temple.name}</Type>
              <View style={styles.metaRow}>
                <Icon name="mapPin" size={13} color={c.onSurfaceVariant} />
                <Type v="bodySm" tone="onSurfaceVariant">
                  {temple.location}
                </Type>
              </View>
            </View>
          </View>
        </Card>

        {/* A temple the dashboard has switched off still gets a screen — the
            explanation belongs here, not in a dead-end button elsewhere. */}
        {!allowed && (
          <Card variant="sunken" style={{ borderLeftWidth: 3, borderLeftColor: c.error }}>
            <View style={styles.metaRow}>
              <Icon name="close" size={16} color={c.error} strokeWidth={2.4} />
              <Type v="bodyMd" tone="error" style={{ flex: 1 }}>
                {t('booking_off')}
              </Type>
            </View>
          </Card>
        )}

        {/* Seva */}
        <View style={styles.block}>
          <Type v="titleLg">{t('choose_seva')}</Type>
          {sevas.map((s) => {
            const on = s.id === seva.id;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !allowed }}
                disabled={!allowed}
                onPress={() => setSeva(s)}
                style={[
                  styles.seva,
                  {
                    backgroundColor: on ? c.accentContainer : c.containerLowest,
                    borderColor: on ? c.gold : c.outlineVariant,
                    opacity: allowed ? 1 : 0.5,
                  },
                ]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.sevaHead}>
                    <Type v="titleSm">{s.name}</Type>
                    <Type v="bodySm" tone="goldInk">
                      {s.nameHi}
                    </Type>
                  </View>
                  <Type v="bodySm" tone="onSurfaceVariant">
                    {s.description}
                  </Type>
                  <Type v="labelSm" tone="onSurfaceFaint">
                    {s.duration}
                  </Type>
                </View>
                <View style={styles.sevaRight}>
                  <Type v="titleSm" tone="primary" numeric>
                    ₹{s.price}
                  </Type>
                  <View style={[styles.radio, { borderColor: on ? c.primary : c.outline }]}>
                    {on && <View style={[styles.radioDot, { backgroundColor: c.primary }]} />}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Date */}
        <View style={styles.block}>
          <Type v="titleLg">{t('choose_date')}</Type>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dates}>
            {dates.map((d) => (
              <Chip
                key={d.iso}
                label={d.label(lang === 'hi' ? 'hi-IN' : 'en-IN')}
                selected={day === d.iso}
                onPress={() => allowed && setDay(d.iso)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Sankalp details — the name and gotra are recited during the rite,
            which is why this is a required field and not a nicety. */}
        <View style={styles.block}>
          <Type v="titleLg">{t('devotee_details')}</Type>
          <Field
            label={t('full_name')}
            value={name}
            onChangeText={setName}
            placeholder={t('ph_full_name')}
            editable={allowed}
          />
          <Field
            label={t('ph_gotra')}
            value={gotra}
            onChangeText={setGotra}
            placeholder="Kashyap"
            editable={allowed}
          />
          <Type v="labelSm" tone="onSurfaceFaint">
            {t('sankalp_note')}
          </Type>
        </View>

        {/* Summary */}
        <Card variant="sunken">
          <View style={styles.sumRow}>
            <Type v="bodyMd">{seva.name}</Type>
            <Type v="bodyMd" numeric>
              ₹{seva.price.toFixed(2)}
            </Type>
          </View>
          <View style={styles.sumRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
              <Type v="bodyMd">{t('prasad_delivery')}</Type>
              <Switch
                value={prasad}
                onValueChange={setPrasad}
                disabled={!allowed}
                trackColor={{ true: c.primary, false: c.outlineVariant }}
                thumbColor={c.containerLowest}
              />
            </View>
            <Type v="bodyMd" numeric tone={prasad ? 'onSurface' : 'onSurfaceFaint'}>
              ₹{prasadFee.toFixed(2)}
            </Type>
          </View>
          <View style={{ paddingVertical: Space.sm }}>
            <Divider gold />
          </View>
          <View style={styles.sumRow}>
            <Type v="titleMd">{t('total_payable')}</Type>
            <Type v="titleMd" tone="primary" numeric>
              ₹{total.toFixed(2)}
            </Type>
          </View>
        </Card>

        <Button
          label={`${t('confirm_booking')} ₹${total.toFixed(2)}`}
          icon="diya"
          size="lg"
          block
          disabled={!canBook}
          onPress={onPay}
        />
      </ScrollView>

      <RazorpayCheckout
        visible={payOpen}
        amount={total}
        onClose={() => setPayOpen(false)}
        onResult={(status, method) => {
          logPayment({
            amount: total,
            method,
            status,
            note: `booking · ${seva.id} · ${temple.name} · ${day}`,
          });
          if (status === 'success') {
            createBooking({
              templeId: temple.id,
              templeName: temple.name,
              templeLocation: temple.location,
              sevaId: seva.id,
              sevaName: seva.name,
              sevaNameHi: seva.nameHi,
              price: seva.price,
              totalAmount: total,
              date: day,
              devoteeName: name.trim() || 'Devotee',
              gotra: gotra.trim() || undefined,
              prasad,
              status: 'upcoming',
            }).catch(() => {});
            setTimeout(() => {
              setPayOpen(false);
              Alert.alert('🙏', t('booking_done'), [
                {
                  text: t('my_poojas'),
                  onPress: () => router.replace('/my-poojas'),
                },
                { text: 'OK', onPress: () => router.back() },
              ]);
            }, 900);
          }
        }}
      />
    </Screen>
  );
}

/** The next `n` days, starting today, as pickable chips. */
function nextDays(n: number) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      iso: d.toISOString().slice(0, 10),
      label: (locale: string) =>
        i === 0
          ? 'Today'
          : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
    };
  });
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },
  block: { gap: Space.sm },

  templeRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  glyphWrap: { width: 64, height: 64, justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  seva: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    padding: Space.md,
  },
  sevaHead: { flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' },
  sevaRight: { alignItems: 'flex-end', gap: Space.sm },
  radio: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: Radius.full },

  dates: { gap: Space.sm, paddingVertical: 2, paddingRight: Space.sm },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
    gap: Space.sm,
  },
});
