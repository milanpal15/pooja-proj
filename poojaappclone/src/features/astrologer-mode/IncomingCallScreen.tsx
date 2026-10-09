import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Screen, Type, useToast } from '@/components/ui';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { acceptCall, declineCall } from '@/lib/api';
import { fill } from '@/lib/fill';
import { Space } from '@/theme';

import { useAstrologerShell } from './AstrologerShell';
import { IncomingActions } from './components/IncomingActions';
import { shortName } from './lib/money';

const DEFAULT_RING_SEC = 25;

/**
 * An incoming call. The countdown starts when the call reached this phone and
 * uses the server's `ringTimeoutSec`; at zero the app declines on the
 * astrologer's behalf (the server independently marks it missed).
 */
export function IncomingCallScreen() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { setting } = useContent();
  const { incoming, resolveIncoming } = useAstrologerShell();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<string | null>(null);
  const closing = useRef(false);

  const call = incoming?.call ?? null;
  useEffect(() => {
    if (call) seen.current = call.id;
  }, [call]);

  // The caller hung up / it timed out server-side while we were looking.
  useEffect(() => {
    if (closing.current) return;
    if (!call && seen.current) {
      toast.info(t('inc_gone'));
      router.back();
    } else if (!call && !seen.current) {
      router.back();
    }
  }, [call, router, toast, t]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(5, setting('ringTimeoutSec', DEFAULT_RING_SEC));
  const left = incoming ? Math.max(0, total - Math.floor((now - incoming.arrivedAt) / 1000)) : total;

  const decline = async () => {
    if (!call || busy) return;
    setBusy(true);
    closing.current = true;
    resolveIncoming(call.id);
    await declineCall(call.id).catch(() => {});
    router.back();
  };

  // Auto-decline at zero.
  const expired = !!call && left === 0;
  const declineRef = useRef(decline);
  useEffect(() => {
    declineRef.current = decline;
  });
  useEffect(() => {
    if (expired) declineRef.current();
  }, [expired]);

  const accept = async () => {
    if (!call || busy) return;
    setBusy(true);
    closing.current = true;
    try {
      await acceptCall(call.id);
      resolveIncoming(call.id);
      router.replace(`/call/${call.id}` as never);
    } catch {
      setBusy(false);
      closing.current = false;
      toast.error(t('inc_failed'));
    }
  };

  const name = call ? shortName(call.devotee.name) || t('inc_devotee') : '';

  return (
    <Screen mode="sanctum" tabBar={false}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.middle}>
          <Type v="labelLg" tone="accent" center>
            {t('inc_title')}
          </Type>
          <Avatar name={name || '?'} size={112} />
          <Type v="headlineMd" center>
            {name}
          </Type>
          {!!call && (
            <Type v="bodyMd" tone="onSurfaceVariant" center numeric>
              {fill(t('inc_rate'), { n: call.ratePerMin })}
            </Type>
          )}
        </View>
        <View style={styles.bottom}>
          <IncomingActions onDecline={decline} onAccept={accept} disabled={busy || !call} />
          <Type v="labelMd" tone="onSurfaceVariant" center accessibilityLiveRegion="polite" numeric>
            {fill(t('inc_auto'), { n: left })}
          </Type>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'space-between', padding: Space.margin },
  middle: { alignItems: 'center', gap: Space.md, marginTop: Space.xxl },
  bottom: { gap: Space.lg, paddingBottom: Space.lg },
});
