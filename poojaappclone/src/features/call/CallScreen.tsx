import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Screen, Type, useToast } from '@/components/ui';
import { assetUrl } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { AddCoinsSheet, useWallet } from '@/features/wallet';
import { formatClock } from '@/lib/duration';
import { fill } from '@/lib/fill';
import { Space } from '@/theme';

import { CallControls } from './components/CallControls';
import { CallTimer } from './components/CallTimer';
import { LiveMeter } from './components/LiveMeter';
import { LowBalanceBanner } from './components/LowBalanceBanner';
import { useCallSession } from './hooks/use-call-session';
import { useRtc } from './hooks/use-rtc';

/**
 * The live call. The same screen serves both sides: the devotee sees the
 * astrologer, the live meter and the low-balance banner; the astrologer sees
 * the devotee's first name and a plain timer (no coins).
 */
export function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const wallet = useWallet();
  const { call, phase, elapsed, offline, isAstrologer, cancel, end, retry } = useCallSession(id);
  const rtc = useRtc(phase === 'connected' ? call?.rtc : null);
  const [adding, setAdding] = useState(false);

  // Leaving mid-call by accident would strand a billed call: make Back inert.
  useEffect(() => {
    if (phase === 'ended') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [phase]);

  // Hand over to the receipt (devotee) or back to the astrologer's home.
  const ended = phase === 'ended';
  useEffect(() => {
    if (!ended || !id) return;
    router.replace((isAstrologer ? '/astro-home' : `/call/summary/${id}`) as never);
  }, [ended, id, isAstrologer, router]);

  // Voice problems are persistent facts of this call: say each once.
  const problem = rtc.problem;
  useEffect(() => {
    if (problem === 'unavailable') toast.error(t('call_need_build'));
    else if (problem === 'mic') toast.error(t('call_mic_denied'));
    else if (problem === 'failed') toast.error(t('call_rtc_failed'));
  }, [problem, toast, t]);

  const askEnd = () =>
    Alert.alert(t('call_end_title'), t('call_end_msg'), [
      { text: t('call_keep'), style: 'cancel' },
      {
        text: t('call_end_confirm'),
        style: 'destructive',
        onPress: () => end().catch(() => toast.error(t('call_err_offline'))),
      },
    ]);

  const doCancel = () => cancel().catch(() => toast.error(t('call_err_offline')));

  if (phase === 'loading' || phase === 'error') {
    return (
      <Screen mode="sanctum" tabBar={false}>
        <SafeAreaView style={styles.center}>
          {phase === 'loading' ? (
            <>
              <ActivityIndicator />
              <Type v="bodyMd" tone="onSurfaceVariant" center>
                {t('call_loading')}
              </Type>
            </>
          ) : (
            <>
              <Type v="titleMd" center>
                {t('call_load_error')}
              </Type>
              <Button label={t('astro_retry')} variant="glass" onPress={retry} />
              <Button label={t('sum_done')} variant="ghost" onPress={() => router.back()} />
            </>
          )}
        </SafeAreaView>
      </Screen>
    );
  }

  if (!call) return null;

  const person = isAstrologer
    ? { name: call.devotee.name.trim().split(/\s+/)[0] || t('inc_devotee'), photo: undefined }
    : { name: call.astrologer.name, photo: assetUrl(call.astrologer.photoUrl ?? undefined) };
  const ringing = phase === 'ringing';
  const showMeter = !isAstrologer && phase === 'connected';
  const left = call.balance ?? wallet.balance;
  const status = ringing
    ? fill(t('call_ringing'), { name: person.name })
    : offline
      ? t('call_reconnecting')
      : rtc.joined || call.rtc?.provider === 'mock'
        ? t('call_connected')
        : t('call_connecting');

  return (
    <Screen mode="sanctum" tabBar={false}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.top}>
          {!isAstrologer && phase === 'connected' && call.lowBalance && (
            <LowBalanceBanner onAddCoins={() => setAdding(true)} />
          )}
        </View>

        <View style={styles.middle}>
          <Avatar name={person.name} photoUrl={person.photo} size={112} />
          <Type v="headlineMd" center numberOfLines={1}>
            {person.name}
          </Type>
          {ringing ? (
            <Type v="bodyMd" tone="onSurfaceVariant" center style={styles.sub}>
              {t('call_ringing_sub')}
            </Type>
          ) : (
            <CallTimer seconds={elapsed} />
          )}
          <Type v="labelLg" tone="accent" center accessibilityLiveRegion="polite">
            {ringing ? '' : status}
          </Type>
        </View>

        <View style={styles.bottom}>
          {showMeter && <LiveMeter rate={call.ratePerMin} used={call.coinsCharged} left={left} />}
          {ringing ? (
            !isAstrologer && (
              <Button label={t('call_cancel')} variant="glass" block onPress={doCancel} />
            )
          ) : (
            <>
              <CallControls
                muted={rtc.muted}
                speaker={rtc.speaker}
                onMute={() => rtc.setMuted(!rtc.muted)}
                onSpeaker={() => rtc.setSpeaker(!rtc.speaker)}
                onEnd={askEnd}
              />
              {!isAstrologer && (
                <Type v="labelMd" tone="onSurfaceVariant" center>
                  {fill(t('call_next_charge'), { t: formatClock(call.minutesBilled * 60) })}
                </Type>
              )}
            </>
          )}
        </View>
      </SafeAreaView>

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
  fill: { flex: 1, paddingHorizontal: Space.margin, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md, padding: Space.margin },
  top: { paddingTop: Space.sm, minHeight: 64 },
  middle: { alignItems: 'center', gap: Space.sm },
  sub: { paddingHorizontal: Space.lg },
  bottom: { gap: Space.lg, paddingBottom: Space.lg },
});
