import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { Screen, useToast } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { AppBar } from '@/components/ui/surface';
import { WalletChip } from '@/features/wallet';
import { useLanguage } from '@/i18n';

import { ConfirmBody } from './components/ConfirmBody';
import { useListing } from './hooks/use-listings';
import { decodeCart } from './lib/cart';

/** Step 2: review the chosen offerings and pay. `?slug=&items=key:qty,..` come from the detail page. */
export function ChadhavaConfirmScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { slug, items } = useLocalSearchParams<{ slug: string; items: string }>();
  const m = useListing(String(slug ?? ''));
  const cart = useMemo(() => decodeCart(items), [items]);

  return (
    <Screen tabBar={false}>
      <AppBar title={t('cs_confirm_title')} subtitle={m.data?.templeName.toUpperCase()} right={<WalletChip />} />
      <AsyncState status={m.status} hasData={!!m.data} onRetry={m.reload} skeletonHeight={160}>
        {m.data ? (
          <ConfirmBody
            listing={m.data}
            cart={cart}
            onChange={() => router.back()}
            onPlaced={() => {
              toast.success(t('cs_placed'));
              router.dismissTo({ pathname: '/my-bookings', params: { tab: 'chadhava' } });
            }}
          />
        ) : null}
      </AsyncState>
    </Screen>
  );
}
