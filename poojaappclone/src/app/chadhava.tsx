import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { RazorpayCheckout } from '@/components/payment/razorpay-checkout';
import { TempleGlyph } from '@/components/pooja/temple-glyph';
import { Button, Card, Chip, Divider, Field, Icon, Screen, Type, type IconName, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { TEMPLES } from '@/constants/temples';
import { useAdmin } from '@/context/admin';
import { type StringKey, useLanguage } from '@/context/language';
import { Radius, Space, useTheme } from '@/theme';

/**
 * E-Chadhava — offerings and checkout.
 *
 * Restyled, with two corrections carried from the export:
 *
 *  - The selected amount chip was navy (#1F3A5F), a colour that appears
 *    nowhere else in the system. Selection is kumkum, like every other
 *    active state.
 *  - "PAY NOW" was white on gold at roughly 2:1. It is now the standard
 *    primary button, whose ink measures 7.97:1 on the same fill.
 *
 * Prices are still hardcoded here. They move to `temple_offerings` in
 * phase P4-2 of the build plan; the shape below already matches that table.
 */

const CHIPS = [51, 101, 251, 501, 1100];
const SERVICE_FEE = 5;

const OFFERINGS: {
  key: string;
  labelKey: StringKey;
  sub: string;
  price: number;
  icon: IconName;
}[] = [
  { key: 'flowers', labelKey: 'off_flowers', sub: '(Pushpam)', price: 11, icon: 'marigold' },
  { key: 'prasad', labelKey: 'off_prasad', sub: '(Bhog)', price: 5, icon: 'gift' },
  { key: 'vastram', labelKey: 'off_vastram', sub: '(Attire)', price: 10, icon: 'lotus' },
];

export default function ChadhavaScreen() {
  const { c } = useTheme();
  const { flags, logPayment } = useAdmin();
  const { t } = useLanguage();
  const toast = useToast();

  const { temple: templeId } = useLocalSearchParams<{ temple?: string }>();
  const [temple, setTemple] = useState(
    () => TEMPLES.find((tpl) => tpl.id === templeId) ?? TEMPLES[0],
  );
  const [amount, setAmount] = useState('101');
  const [offering, setOffering] = useState('flowers');
  const [payOpen, setPayOpen] = useState(false);

  const amt = parseInt(amount || '0', 10) || 0;
  const total = amt + SERVICE_FEE;

  const onPay = () => {
    if (!flags.payments) {
      toast.info(t('payments_off'), { description: t('payments_off_msg') });
      return;
    }
    setPayOpen(true);
  };

  return (
    <Screen tabBar={false}>
      <AppBar title={t('echadhava_title')} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Temple — selectable. The offering goes to whichever is chosen. */}
        <View style={styles.block}>
          <Card>
            <View style={styles.templeRow}>
              <View style={styles.glyphWrap}>
                <TempleGlyph temple={temple} size={64} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Type v="labelSm" tone="onSurfaceFaint">
                  {t('offering_to')}
                </Type>
                <Type v="titleMd">{temple.name}</Type>
                <View style={styles.locRow}>
                  <Icon name="mapPin" size={13} color={c.onSurfaceVariant} />
                  <Type v="bodySm" tone="onSurfaceVariant">
                    {temple.location}
                  </Type>
                </View>
              </View>
            </View>
          </Card>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {TEMPLES.map((tpl) => (
              <Chip
                key={tpl.id}
                label={tpl.name}
                selected={tpl.id === temple.id}
                onPress={() => setTemple(tpl)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Amount */}
        <View style={styles.block}>
          <Field
            label={t('enter_amount')}
            value={amount}
            onChangeText={(x) => setAmount(x.replace(/\D/g, '').slice(0, 7))}
            keyboardType="number-pad"
            amount
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {CHIPS.map((v) => (
              <Chip
                key={v}
                label={`₹${v}`}
                selected={amt === v}
                onPress={() => setAmount(String(v))}
              />
            ))}
          </ScrollView>
        </View>

        {/* Offerings */}
        <View style={styles.offerings}>
          {OFFERINGS.map((o) => {
            const active = offering === o.key;
            return (
              <Pressable
                key={o.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setOffering(o.key)}
                style={[
                  styles.offering,
                  {
                    backgroundColor: active ? c.accentContainer : c.containerLowest,
                    borderColor: active ? c.gold : c.outlineVariant,
                  },
                ]}>
                <Icon name={o.icon} size={30} color={active ? c.primary : c.goldInk} />
                <Type v="titleSm" center numberOfLines={1}>
                  {t(o.labelKey)}
                </Type>
                <Type v="labelSm" tone="onSurfaceFaint" center>
                  {o.sub}
                </Type>
                <Type v="labelMd" tone="goldInk" numeric>
                  ₹{o.price.toFixed(2)}
                </Type>
              </Pressable>
            );
          })}
        </View>

        {/* Summary */}
        <Card variant="sunken">
          <SumRow label={t('offering_amount')} value={amt} />
          <SumRow label={t('service_fee')} value={SERVICE_FEE} />
          <View style={{ paddingVertical: Space.sm }}>
            <Divider gold />
          </View>
          <SumRow label={t('total_payable')} value={total} strong />
          <View style={styles.secureRow}>
            <Icon name="check" size={13} color={c.success} strokeWidth={2.4} />
            <Type v="labelSm" tone="onSurfaceFaint">
              {t('secure_payment')}
            </Type>
          </View>
        </Card>

        <Button
          label={`${t('pay_now')} ₹${total.toFixed(2)}`}
          icon="gift"
          size="lg"
          block
          onPress={onPay}
        />
      </ScrollView>

      <RazorpayCheckout
        visible={payOpen}
        amount={total}
        onClose={() => setPayOpen(false)}
        onResult={(status, method) => {
          logPayment({ amount: total, method, status, note: `${offering} · ${temple.name}` });
          if (status === 'success') {
            setTimeout(() => {
              setPayOpen(false);
              toast.success(t('offering_received'));
            }, 900);
          }
        }}
      />
    </Screen>
  );
}

function SumRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <View style={styles.sumRow}>
      <Type v={strong ? 'titleMd' : 'bodyMd'}>{label}</Type>
      <Type v={strong ? 'titleMd' : 'bodyMd'} tone={strong ? 'primary' : 'onSurface'} numeric>
        ₹{value.toFixed(2)}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
  block: { gap: Space.sm },

  templeRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  glyphWrap: { width: 64, height: 64, justifyContent: 'center' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  chips: { gap: Space.sm, paddingVertical: 2, paddingRight: Space.sm },

  offerings: { flexDirection: 'row', gap: Space.sm },
  offering: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 3,
  },

  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 6,
  },
});
