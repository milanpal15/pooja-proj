import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { BalanceLines, BillRow, BottomBar, Button, Card, OrderSummary, Type } from '@/components/ui';
import { AddCoinsSheet } from '@/features/wallet';
import { useCoinSpend } from '@/hooks/use-coin-spend';
import { useLanguage } from '@/i18n';
import { type ChadhavaListingDetail, type ChadhavaOrder, createChadhavaOrder } from '@/lib/api';
import { shortBy } from '@/lib/coin-bill';
import { fill, formatCoins } from '@/lib/format';
import { pick } from '@/lib/localized';
import { useWallet } from '@/providers/wallet';
import { placeLine } from '@/lib/place';
import { Space, useTheme } from '@/theme';

import { type Cart, cartItems, cartTotal } from '../lib/cart';

type Props = {
  listing: ChadhavaListingDetail;
  cart: Cart;
  onChange: () => void;
  onPlaced: () => void;
};

/** The bill for the chosen offerings, balance before/after, and Pay. */
export function ConfirmBody({ listing, cart, onChange, onPlaced }: Props) {
  const { t, lang } = useLanguage();
  const { balance } = useWallet();
  const { c } = useTheme();

  // Only offerings still on sale count; one an operator withdrew meanwhile is dropped.
  const chosen = useMemo(
    () => listing.offerings.filter((o) => (cart[o.key] ?? 0) > 0),
    [listing.offerings, cart],
  );
  const items = useMemo(() => cartItems(Object.fromEntries(chosen.map((o) => [o.key, cart[o.key]]))), [chosen, cart]);
  const total = cartTotal(chosen, cart);
  const signature = JSON.stringify([listing.slug, items]);

  // The app sends keys and quantities only — never a price.
  const submit = useCallback(
    (requestId: string) => createChadhavaOrder({ listingSlug: listing.slug, items, requestId }),
    [listing.slug, items],
  );
  const messageFor = useCallback(
    (code?: string) =>
      code === 'listing_closed' ? t('cs_err_closed') : code === 'invalid_items' ? t('cs_err_items') : undefined,
    [t],
  );
  const spend = useCoinSpend<{ order: ChadhavaOrder }>({ signature, submit, onSuccess: onPlaced, messageFor });

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OrderSummary
          image={listing.gallery[0] || listing.banner}
          title={pick(lang, listing.title, listing.titleHi)}
          packageLine={placeLine(listing.templeName, listing.place)}
          changeLabel={t('cs_edit')}
          onChange={onChange}
        />

        <Card variant="sunken" style={{ backgroundColor: c.container, borderRadius: 18, padding: 16 }}>
          {chosen.map((o) => (
            <BillRow key={o.key} label={`${pick(lang, o.title, o.titleHi)} × ${cart[o.key]}`} coins={o.coins * cart[o.key]} />
          ))}
          <BillRow label={t('cs_total')} coins={total} strong last />
          <BalanceLines balance={balance} total={total} />
        </Card>

        <Type v="labelSm" tone="onSurfaceVariant" style={{ fontWeight: '400', lineHeight: 17 }}>
          {t('cs_pay_note')}
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
          label={fill(t('cs_pay'), { n: formatCoins(total) })}
          loading={spend.busy}
          disabled={spend.busy || items.length === 0}
          onPress={spend.pay}
        />
      </BottomBar>

      <AddCoinsSheet
        visible={spend.shortfall != null}
        onClose={spend.dismissShortfall}
        shortfall={spend.shortfall ?? undefined}
        title={t('cs_sheet_title')}
        subtitle={fill(t('cs_sheet_sub'), {
          total: formatCoins(total),
          balance: formatCoins(balance ?? 0),
          short: formatCoins(spend.shortfall ?? shortBy(balance, total)),
        })}
        onPurchased={spend.pay}
      />
    </>
  );
}

const styles = StyleSheet.create({ scroll: { padding: Space.md, gap: Space.md + 4 } });
