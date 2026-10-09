import { useLocalSearchParams, useRouter } from 'expo-router';

import { NoContent, Screen } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { AppBar } from '@/components/ui/surface';
import { WalletChip } from '@/features/wallet';
import { useLanguage } from '@/i18n';

import { CheckoutForm } from './components/CheckoutForm';
import { usePoojaDetail } from './hooks/use-pooja-detail';

/** Step 2: names, prasad, bill, pay. `?slug=&pkg=` come from the detail page. */
export function PoojaCheckoutScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { slug, pkg } = useLocalSearchParams<{ slug: string; pkg: string }>();
  const m = usePoojaDetail(String(slug ?? ''));
  const p = m.data;
  const chosen = p?.packages.find((x) => x.key === pkg);

  return (
    <Screen tabBar={false}>
      <AppBar title={t('ps_confirm_title')} subtitle={p?.templeName.toUpperCase()} right={<WalletChip />} />
      <AsyncState status={m.status} hasData={!!p} onRetry={m.reload} skeletonHeight={160}>
        {p && chosen ? (
          <CheckoutForm
            pooja={p}
            pkg={chosen}
            onChange={() => router.back()}
            onBooked={(id) => router.replace({ pathname: '/booked', params: { id } })}
          />
        ) : (
          // The package vanished between the two screens (an operator disabled it).
          <NoContent hi={lang === 'hi'} title={t('ps_err_gone')} body="" />
        )}
      </AsyncState>
    </Screen>
  );
}
