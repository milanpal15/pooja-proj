import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Coins, Type } from '@/components/ui';
import { AddCoinsSheet } from '@/features/wallet';
import { useLanguage } from '@/i18n';
import { useWallet } from '@/providers/wallet';
import { Kumkum, Radius, Space, useTheme } from '@/theme';

/** The balance with "Add coins" (the purchase sheet); tapping the balance opens the ledger. */
export function CoinsCard() {
  const router = useRouter();
  const { t } = useLanguage();
  const { balance } = useWallet();
  const { scheme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <LinearGradient colors={[Kumkum[700], Kumkum[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('my_coins')}
        onPress={() => router.push('/wallet')}
        style={styles.left}>
        <Type v="labelMd" color="#FFFFFF">
          {t('bp_your_coins')}
        </Type>
        {balance == null ? (
          <Type v="titleLg" color="#FFFFFF">
            —
          </Type>
        ) : (
          <Coins value={balance} size="lg" tone={scheme === 'dark' ? 'onSurface' : 'onPrimary'} />
        )}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.add}>
        <Type v="labelLg" color={Kumkum[600]}>
          {t('bp_add_coins')}
        </Type>
      </Pressable>
      <AddCoinsSheet visible={open} onClose={() => setOpen(false)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: Space.md, marginTop: Space.lg, borderRadius: Radius.xl, padding: Space.md },
  left: { flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  add: { height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center' },
});
