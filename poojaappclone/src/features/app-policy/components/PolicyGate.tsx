import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/providers/auth';

import { usePolicy } from '../hooks/use-policy';
import { parseSnooze, shouldShowNudge, snoozedUntilFor, snoozeUntil, nudgeKey } from '../lib/policy';
import { BlockedBuildScreen } from './BlockedBuildScreen';
import { MaintenanceScreen } from './MaintenanceScreen';
import { UnsupportedOsNotice } from './UnsupportedOsNotice';
import { UpdateAvailableBanner } from './UpdateAvailableBanner';
import { UpdateRequiredScreen } from './UpdateRequiredScreen';

const SNOOZE_KEY = 'bhakti.appPolicy.snooze.v1';

/**
 * Mounted once at the root. ALWAYS renders `children` (first paint never waits for the policy); a
 * blocking status draws a full-screen Modal over the top, the softer ones a notice or banner.
 */
export function PolicyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { policy, at, checking, retry } = usePolicy(user?.uid ?? null);
  const [osDismissed, setOsDismissed] = useState(false); // once per launch: lives as long as the gate
  const [snoozeRaw, setSnoozeRaw] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SNOOZE_KEY).then(setSnoozeRaw).catch(() => {});
  }, []);

  const later = useCallback(() => {
    const until = snoozeUntil(policy, Date.now());
    const raw = JSON.stringify({ key: nudgeKey(policy), until });
    setSnoozeRaw(raw);
    AsyncStorage.setItem(SNOOZE_KEY, raw).catch(() => {});
  }, [policy]);

  const showNudge = shouldShowNudge(policy, snoozedUntilFor(parseSnooze(snoozeRaw), policy), at);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {policy.status === 'update_required' && <UpdateRequiredScreen policy={policy} />}
      {policy.status === 'blocked' && <BlockedBuildScreen policy={policy} />}
      {policy.status === 'maintenance' && <MaintenanceScreen policy={policy} checking={checking} onRetry={retry} />}
      {policy.status === 'unsupported_os' && !osDismissed && <UnsupportedOsNotice policy={policy} onDismiss={() => setOsDismissed(true)} />}
      {showNudge && <UpdateAvailableBanner policy={policy} onLater={later} />}
    </View>
  );
}
