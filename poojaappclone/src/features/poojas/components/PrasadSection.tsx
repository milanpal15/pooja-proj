import { StyleSheet, View } from 'react-native';

import { Card, Field, Switch, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { Space } from '@/theme';

import type { Address, AddressError } from '../lib/names';

/** Prasad delivery toggle; the address fields appear only when it is on. */
export function PrasadSection({
  fee,
  value,
  onChange,
  address,
  errors,
  onAddress,
}: {
  fee: number;
  value: boolean;
  onChange: (v: boolean) => void;
  address: Address;
  errors: Partial<Record<AddressError, true>>;
  onAddress: (patch: Partial<Address>) => void;
}) {
  const { t } = useLanguage();
  return (
    <View style={{ gap: Space.sm + 2 }}>
      <Type v="titleMd" style={{ fontSize: 17, marginTop: 4 }}>
        {t('ps_prasad_h')}
      </Type>
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Type v="labelLg" style={{ fontSize: 14 }}>
            {t('ps_prasad_toggle')}
          </Type>
          <Type v="labelMd" tone="onSurfaceVariant" style={{ fontWeight: '400' }}>
            {fill(t('ps_prasad_fee'), { n: fee })}
          </Type>
        </View>
        <Switch value={value} onValueChange={onChange} accessibilityLabel={t('ps_prasad_toggle')} />
      </View>
      {value && (
        <View style={{ gap: Space.sm + 2 }}>
          <Field
            label={t('ps_addr_line1')}
            value={address.line1}
            onChangeText={(line1) => onAddress({ line1 })}
            autoComplete="street-address"
            error={errors.line1 ? t('ps_addr_err_line1') : undefined}
          />
          <Field
            label={t('ps_addr_city')}
            value={address.city}
            onChangeText={(city) => onAddress({ city })}
            error={errors.city ? t('ps_addr_err_city') : undefined}
          />
          <Field
            label={t('ps_addr_pin')}
            value={address.pincode}
            onChangeText={(pincode) => onAddress({ pincode: pincode.replace(/\D/g, '').slice(0, 6) })}
            keyboardType="number-pad"
            autoComplete="postal-code"
            error={errors.pincode ? t('ps_addr_err_pin') : undefined}
          />
        </View>
      )}
    </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
