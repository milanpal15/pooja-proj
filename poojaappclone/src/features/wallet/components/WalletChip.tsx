import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Coins, Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { formatCoins, fill } from '@/lib/format';
import { Radius, useTheme } from '@/theme';
import { useWallet } from '@/providers/wallet';

/** The balance as a tappable pill with a "+". Opens the wallet unless told otherwise. */
export function WalletChip({ onPress }: { onPress?: () => void }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { balance } = useWallet();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        balance == null ? t('balance_unknown') : fill(t('balance_chip_label'), { n: formatCoins(balance) })
      }
      onPress={onPress ?? (() => router.push('/wallet'))}
      hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: c.containerLowest, borderColor: c.goldHairline, opacity: pressed ? 0.8 : 1 },
      ]}>
      {balance == null ? <Type v="labelLg">—</Type> : <Coins value={balance} />}
      <Icon name="plus" size={14} color={c.primary} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
