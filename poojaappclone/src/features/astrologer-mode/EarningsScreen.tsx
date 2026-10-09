import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, NoContent, Screen, SectionHeader, Type, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/fill';
import { Space } from '@/theme';

import { EarningsHero } from './components/EarningsHero';
import { PayoutRow } from './components/PayoutRow';
import { useAstrologerEarnings } from './hooks/use-astrologer-earnings';
import { dayOf } from './lib/money';

/** Month and today totals, paid out vs due, and the payout history. */
export function EarningsScreen() {
  const { t } = useLanguage();
  const pad = useScrollPadding();
  const { earnings, loading, error, refresh } = useAstrologerEarnings();
  const now = new Date();
  const since = dayOf(new Date(now.getFullYear(), now.getMonth(), 1).toISOString());

  return (
    <Screen>
      <AppBar title={t('am_earnings_title')} back={false} />
      <ScrollView
        contentContainerStyle={[styles.scroll, pad]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
        {loading && !earnings && <ActivityIndicator />}
        {error && !earnings && (
          <View style={{ gap: Space.sm }}>
            <NoContent title={t('am_load_error')} body="" />
            <Button label={t('astro_retry')} variant="outline" onPress={refresh} />
          </View>
        )}
        {earnings && (
          <>
            <EarningsHero earnings={earnings} since={since} />
            <Card variant="sunken" style={styles.facts}>
              <Type v="bodyMd">
                {fill(t('start_upto_val'), { n: earnings.month.minutes })}
                {' · '}
                {`${earnings.month.calls} ${t('am_calls_title')}`}
              </Type>
              <Type v="labelMd" tone="onSurfaceVariant">
                {t('am_this_month')}
              </Type>
            </Card>
            <View>
              <SectionHeader title={t('am_payouts')} />
              {earnings.payouts.length === 0 ? (
                <Type v="bodySm" tone="onSurfaceVariant">
                  {t('am_no_payouts')}
                </Type>
              ) : (
                earnings.payouts.map((p, i) => <PayoutRow key={`${p.paidAt}-${i}`} payout={p} />)
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.margin, gap: Space.md },
  facts: { gap: 2 },
});
