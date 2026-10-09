import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { CoinDisc, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { formatCoins } from '@/lib/format';
import { Radius, Space, useTheme } from '@/theme';

/** The balance, on the dark ember plate. `balance` is null until first read. */
export function BalanceCard({ balance }: { balance: number | null }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const text = balance == null ? '—' : formatCoins(balance);

  return (
    <LinearGradient
      colors={[c.emberWash[0], c.emberWash[2]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      accessible
      accessibilityLabel={`${t('wallet_balance')}: ${text} ${t('coins_word')}`}
      style={styles.card}>
      <Type v="labelMd" color="#E4D3C4">
        {t('wallet_balance')}
      </Type>
      <View style={styles.row}>
        <CoinDisc size={30} />
        <Type v="numeral" color="#FFF6E6" numeric>
          {text}
        </Type>
        <Type v="bodySm" color="#E4D3C4">
          {t('coins_word')}
        </Type>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl - 4, padding: Space.margin, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
