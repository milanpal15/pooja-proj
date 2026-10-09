import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Screen, Type, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useAdmin } from '@/providers/admin';
import { useLanguage } from '@/i18n';
import { useWallet } from '@/providers/wallet';
import { Space, useTheme } from '@/theme';

import { BalanceCard } from './components/BalanceCard';
import { PackGrid } from './components/PackGrid';
import { PayButton } from './components/PayButton';
import { TestModeBanner } from './components/TestModeBanner';
import { TransactionList } from './components/TransactionList';
import { useCoinPacks } from './hooks/use-coin-packs';
import { useRecharge } from './hooks/use-recharge';
import { useTransactions } from './hooks/use-transactions';

/** The wallet: balance, buy coins, history. */
export function WalletScreen() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const { flags } = useAdmin();
  const { balance, refresh } = useWallet();
  const scrollPad = useScrollPadding();
  const { packs, status, reload } = useCoinPacks();
  const history = useTransactions(balance);
  const { buy, busy, testMode, error } = useRecharge();
  const [picked, setPicked] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = packs.find((p) => p.id === picked) ?? packs[0];

  const onRefresh = async () => {
    setRefreshing(true);
    reload();
    history.reload();
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen tabBar={false} watermark>
      <AppBar title={t('my_coins')} />
      <ScrollView
        contentContainerStyle={[styles.scroll, scrollPad]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gold} />}
        showsVerticalScrollIndicator={false}>
        <BalanceCard balance={balance} />

        <View style={styles.block}>
          <View style={styles.head}>
            <Type v="titleLg">{t('add_coins')}</Type>
            <Type v="labelSm" tone="onSurfaceFaint">
              {t('coin_rate_note')}
            </Type>
          </View>

          {status === 'loading' ? (
            <ActivityIndicator color={c.gold} style={{ margin: Space.lg }} />
          ) : status === 'error' || packs.length === 0 ? (
            <View style={styles.block}>
              <Type v="bodyMd" tone="onSurfaceVariant" center>
                {status === 'error' ? t('packs_error') : t('packs_empty')}
              </Type>
              <Button label={t('retry')} variant="outline" onPress={reload} style={{ alignSelf: 'center' }} />
            </View>
          ) : (
            <>
              <PackGrid packs={packs} selectedId={selected?.id} onSelect={(p) => setPicked(p.id)} />
              {__DEV__ && testMode && <TestModeBanner />}
              {!flags.payments && (
                <Type v="labelMd" tone="error" center>
                  {t('coins_buy_off')}
                </Type>
              )}
              {!!error && !busy && (
                <Type v="labelMd" tone="error" center accessibilityLiveRegion="polite">
                  {error}
                </Type>
              )}
              <PayButton pack={selected} busy={busy} disabled={!flags.payments} onPress={() => selected && buy(selected)} />
              <Type v="labelSm" tone="onSurfaceFaint" center>
                {t('coins_policy')}
              </Type>
            </>
          )}
        </View>

        <TransactionList transactions={history.transactions} status={history.status} onRetry={history.reload} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },
  block: { gap: Space.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
