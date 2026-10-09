import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, NoContent, Screen, SectionHeader, Type, useScrollPadding, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useAuth } from '@/providers/auth';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { useAstrologerShell } from './AstrologerShell';
import { AvailabilityCard } from './components/AvailabilityCard';
import { CallLogRow } from './components/CallLogRow';
import { EarningsHero } from './components/EarningsHero';
import { TodayStats } from './components/TodayStats';
import { useAstrologerEarnings } from './hooks/use-astrologer-earnings';
import { useMyCalls } from './hooks/use-my-calls';
import { dayOf, isSameDay } from './lib/money';

/** Astrologer home: availability, earnings, today, and the latest calls. */
export function AstrologerHomeScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const pad = useScrollPadding();
  const presence = useAstrologerShell();
  const earn = useAstrologerEarnings();
  const log = useMyCalls(30);
  const [refreshing, setRefreshing] = useState(false);

  const onToggle = async (next: boolean) => {
    const r = await presence.toggle(next);
    if (r === 'on_call') toast.error(t('am_presence_on_call'));
    else if (r === 'failed') toast.error(t('am_presence_failed'));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([earn.refresh(), log.refresh(), presence.reload()]);
    setRefreshing(false);
  }, [earn, log, presence]);

  const todayRows = useMemo(() => log.calls.filter((c) => isSameDay(c.startedAt)), [log.calls]);
  const missedToday = log.error ? null : todayRows.filter((c) => (c.endReason ?? c.status) === 'missed').length;
  const monthStart = dayOf(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  return (
    <Screen>
      <AppBar brand={user?.astrologer?.name || user?.name || t('am_role')} subtitle={t('am_role')} back={false} />
      <ScrollView
        contentContainerStyle={[styles.scroll, pad]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <AvailabilityCard
          online={presence.online}
          rate={presence.rate}
          disabled={presence.loading || presence.toggling}
          onChange={onToggle}
        />

        {earn.earnings ? (
          <EarningsHero earnings={earn.earnings} since={monthStart} />
        ) : earn.loading ? (
          <ActivityIndicator />
        ) : (
          <Card variant="sunken" style={{ alignItems: 'center', gap: Space.sm }}>
            <Type v="bodyMd" center>
              {t('am_load_error')}
            </Type>
            <Button label={t('astro_retry')} size="sm" variant="outline" onPress={earn.refresh} />
          </Card>
        )}

        <TodayStats
          calls={earn.earnings ? earn.earnings.today.calls : null}
          minutes={earn.earnings ? earn.earnings.today.minutes : null}
          missed={missedToday}
        />

        <View>
          <SectionHeader title={t('am_recent')} action={t('am_see_all')} onAction={() => router.push('/astro-calls')} />
          {log.loading ? (
            <ActivityIndicator />
          ) : log.error ? (
            <Button label={t('astro_retry')} size="sm" variant="outline" onPress={log.refresh} />
          ) : log.calls.length === 0 ? (
            <NoContent title={t('am_no_calls_title')} body={t('am_no_calls_body')} />
          ) : (
            log.calls.slice(0, 3).map((row) => <CallLogRow key={row.id} row={row} />)
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ scroll: { paddingHorizontal: Space.margin, gap: Space.md } });
