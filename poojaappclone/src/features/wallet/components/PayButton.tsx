import { Button } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { CoinPack } from '@/lib/api';
import { fill, formatCoins, formatRupees } from '@/lib/format';

/** "Pay ₹20 · get 30 coins" — the one place a rupee amount sits on a button. */
export function PayButton({
  pack,
  busy,
  disabled,
  onPress,
}: {
  pack?: CoinPack;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Button
      label={
        pack
          ? fill(t('pay_for_coins'), { price: formatRupees(pack.price), coins: formatCoins(pack.coins) })
          : t('add_coins')
      }
      icon="gift"
      size="lg"
      block
      loading={busy}
      disabled={!pack || disabled}
      onPress={onPress}
    />
  );
}
