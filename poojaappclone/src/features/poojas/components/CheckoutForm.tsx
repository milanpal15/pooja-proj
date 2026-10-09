import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { BottomBar, Button, OrderSummary, Type } from '@/components/ui';
import { AddCoinsSheet } from '@/features/wallet';
import { useCoinSpend } from '@/hooks/use-coin-spend';
import { useLanguage } from '@/i18n';
import { type Booking, createBooking, type PoojaDetail, type PoojaPackage } from '@/lib/api';
import { fill, formatCoins } from '@/lib/format';
import { pick } from '@/lib/localized';
import { useAuth } from '@/providers/auth';
import { useWallet } from '@/providers/wallet';
import { shortBy } from '@/lib/coin-bill';
import { Space } from '@/theme';

import { useCheckoutForm } from '../hooks/use-checkout-form';
import { formatPoojaDate } from '@/lib/pooja-dates';
import { bookingBody, bookingSignature } from '../lib/payload';
import { BillCard } from './BillCard';
import { NameForms } from './NameForms';
import { PrasadSection } from './PrasadSection';

type Props = {
  pooja: PoojaDetail;
  pkg: PoojaPackage;
  onChange: () => void;
  onBooked: (bookingId: string) => void;
};

/**
 * Everything on the checkout screen once the pooja has loaded. The form lives
 * here — NOT in the route — so the add-coins sheet (a modal over this screen)
 * leaves it exactly as typed, and `pay()` simply runs again after the top-up.
 */
export function CheckoutForm({ pooja, pkg, onChange, onBooked }: Props) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { balance } = useWallet();
  const f = useCheckoutForm(pooja, pkg, user?.name ?? '');

  const { names, prasad, address } = f;
  const body = useMemo(
    () => bookingBody({ poojaSlug: pooja.slug, packageKey: pkg.key, names, prasad, address }),
    [pooja.slug, pkg.key, names, prasad, address],
  );
  // Same order => same signature => same idempotency key across retries.
  const signature = useMemo(
    () => bookingSignature({ poojaSlug: pooja.slug, packageKey: pkg.key, names, prasad, address }),
    [pooja.slug, pkg.key, names, prasad, address],
  );
  // The app never sends a price: only what was chosen.
  const submit = useCallback((requestId: string) => createBooking({ ...body, requestId }), [body]);
  const messageFor = useCallback(
    (code?: string) =>
      code === 'booking_closed' ? t('ps_err_closed')
      : code === 'invalid_names' ? t('ps_err_names')
      : code === 'not_found' ? t('ps_err_gone')
      : undefined,
    [t],
  );
  const spend = useCoinSpend<{ booking: Booking }>({
    signature,
    submit,
    onSuccess: (r) => onBooked(r.booking.id),
    messageFor,
  });

  const onPay = () => {
    f.reveal();
    if (f.valid) spend.pay();
  };
  const title = pick(lang, pooja.title, pooja.titleHi);
  const pkgName = pick(lang, pkg.name, pkg.nameHi);
  const date = formatPoojaDate(pooja.poojaDate, lang) ?? t('ps_every_day');

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <OrderSummary
          image={pkg.image || pooja.banner}
          title={title}
          packageLine={`${pkgName} · ${pkg.persons === 1 ? t('ps_persons_one') : fill(t('ps_persons_n'), { n: pkg.persons })}`}
          date={date}
          changeLabel={t('ps_change')}
          onChange={onChange}
        />

        <NameForms names={f.names} errors={f.nameErrors} onChange={f.setName} />
        {pooja.prasadAvailable && (
          <PrasadSection
            fee={pooja.prasadFeeCoins}
            value={f.prasad}
            onChange={f.setPrasad}
            address={f.address}
            errors={f.addressErrors}
            onAddress={f.setAddress}
          />
        )}
        <BillCard packageName={pkgName} bill={f.bill} balance={balance} />
        <Type v="labelSm" tone="onSurfaceVariant" style={{ fontWeight: '400', lineHeight: 17 }}>
          {t('ps_pay_note')}
        </Type>
        {!!spend.error && (
          <Type v="labelMd" tone="error" accessibilityLiveRegion="polite">
            {spend.error}
          </Type>
        )}
      </ScrollView>

      <BottomBar>
        <Button
          size="lg"
          block
          label={fill(t('ps_pay'), { n: formatCoins(f.bill.total) })}
          loading={spend.busy}
          disabled={spend.busy}
          onPress={onPay}
        />
      </BottomBar>

      <AddCoinsSheet
        visible={spend.shortfall != null}
        onClose={spend.dismissShortfall}
        shortfall={spend.shortfall ?? undefined}
        title={t('ps_sheet_title')}
        subtitle={fill(t('ps_sheet_sub'), {
          total: formatCoins(f.bill.total),
          balance: formatCoins(balance ?? 0),
          short: formatCoins(spend.shortfall ?? shortBy(balance, f.bill.total)),
        })}
        onPurchased={spend.pay}
      />
    </>
  );
}

const styles = StyleSheet.create({ scroll: { padding: Space.md, gap: Space.md + 4 } });
