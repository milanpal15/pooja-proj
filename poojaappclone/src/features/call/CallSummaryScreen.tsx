import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, Button, Screen, Type, useScrollPadding, useToast } from '@/components/ui';
import { assetUrl, useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { AddCoinsSheet, useWallet } from '@/features/wallet';
import { type CallView, fetchCall, rateCall } from '@/lib/api';
import { secondsBetween } from '@/lib/duration';
import { fill } from '@/lib/fill';
import { formatCoins } from '@/lib/format';
import { Space } from '@/theme';

import { RatingPicker } from './components/RatingPicker';
import { Receipt } from './components/Receipt';
import { endCopy, wasConnected } from './lib/end-reason';

/** After a call: how it ended, what it cost, and an optional rating. */
export function CallSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { setting } = useContent();
  const wallet = useWallet();
  const pad = useScrollPadding();

  const [call, setCall] = useState<CallView | null>(null);
  const [failed, setFailed] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [rated, setRated] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setFailed(false);
    try {
      const c = await fetchCall(id);
      setCall(c);
      if (c.rating) {
        setRating(c.rating);
        setRated(true);
      }
    } catch {
      setFailed(true);
    }
  }, [id]);

  const { refresh } = wallet;
  useEffect(() => {
    const id = setTimeout(() => {
      load();
      refresh();
    }, 0);
    return () => clearTimeout(id);
  }, [load, refresh]);

  const pick = async (n: number) => {
    if (!id || rated) return;
    const before = rating;
    setRating(n);
    try {
      await rateCall(id, n);
      setRated(true);
      toast.success(t('sum_thanks'));
    } catch {
      setRating(before);
      toast.error(t('sum_rate_failed'));
    }
  };

  const done = () => router.dismissTo('/' as never);

  if (!call) {
    return (
      <Screen tabBar={false}>
        <View style={styles.center}>
          {failed ? (
            <>
              <Type v="titleMd" center>
                {t('call_load_error')}
              </Type>
              <Button label={t('astro_retry')} variant="outline" onPress={load} />
              <Button label={t('sum_done')} variant="ghost" onPress={done} />
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </Screen>
    );
  }

  const copy = endCopy(call.endReason);
  const billed = wasConnected(call.endReason) && call.minutesBilled > 0;
  const balance = wallet.balance ?? call.balance ?? null;
  const minMinutes = Math.max(1, setting('minMinutes', 3));
  const low = balance !== null && balance < minMinutes * call.ratePerMin;

  return (
    <Screen tabBar={false}>
      <ScrollView contentContainerStyle={[styles.scroll, pad]}>
        <View style={styles.head}>
          <Avatar
            name={call.astrologer.name}
            photoUrl={assetUrl(call.astrologer.photoUrl ?? undefined)}
            size={84}
          />
          <Type v="headlineMd" center>
            {t(copy.title)}
          </Type>
          <Type v="bodyMd" tone="onSurfaceVariant" center>
            {copy.msg
              ? fill(t(copy.msg), { name: call.astrologer.name })
              : fill(t('sum_with'), { name: call.astrologer.name })}
          </Type>
        </View>

        {billed && (
          <>
            <Receipt
              seconds={secondsBetween(call.answeredAt, call.endedAt)}
              minutes={call.minutesBilled}
              rate={call.ratePerMin}
              total={call.coinsCharged}
              balance={balance}
            />
            <Type v="labelMd" tone="onSurfaceFaint" center>
              {t('sum_note')}
            </Type>
            <View style={{ gap: Space.xs }}>
              <Type v="titleSm">
                {t('sum_rate_q')}{' '}
                <Type v="labelMd" tone="onSurfaceFaint">
                  {t('sum_optional')}
                </Type>
              </Type>
              <RatingPicker value={rating} disabled={rated} onPick={pick} />
            </View>
          </>
        )}

        <View style={styles.actions}>
          <Button label={t('sum_done')} block onPress={done} />
          {(low || call.endReason === 'out_of_coins') && balance !== null && (
            <Button
              label={fill(t('sum_add_coins_left'), { n: formatCoins(balance) })}
              variant="outline"
              block
              onPress={() => setAdding(true)}
            />
          )}
        </View>
      </ScrollView>
      <AddCoinsSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onPurchased={() => {
          setAdding(false);
          wallet.refresh();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.lg },
  head: { alignItems: 'center', gap: Space.xs, paddingTop: Space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md },
  actions: { gap: Space.sm, marginTop: Space.sm },
});
