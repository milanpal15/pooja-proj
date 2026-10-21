import { StyleSheet, View } from 'react-native';

import { Icon, ProgressBar, Switch, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

import { progressLine, stopKey } from '../../lib/route';
import type { RouteSessionValue } from './RouteSession';
import { StopCard } from './StopCard';

/** The "12.4 of 31 km · 3 of 7 stops" line and its bar. */
export function ProgressCard({ s }: { s: RouteSessionValue }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const p = s.route.progress;
  return (
    <View style={[styles.progress, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Type v="titleSm" numeric>
        {progressLine(p, t('ev_route_progress'))}
      </Type>
      <ProgressBar value={p?.doneKm ?? 0} max={p?.totalKm ?? 0} />
    </View>
  );
}

/** The card of the selected / next stop, or the "all stops done" row. */
export function SessionStopCard({ s }: { s: RouteSessionValue }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const sel = s.selected;
  if (sel) {
    return (
      <StopCard
        stop={sel}
        distanceM={s.distanceM}
        accuracyM={s.accuracyM}
        permission={s.perm.status}
        joinNeeded={s.joinNeeded}
        busy={s.checkIn.busyKey === stopKey(sel)}
        message={s.checkIn.message}
        onCheckIn={() => void s.checkIn.submit(sel)}
        onDirections={() => s.onDirections(sel)}
        onOpenSettings={s.perm.openSettings}
      />
    );
  }
  if (s.stops.length === 0) return null;
  return (
    <View style={styles.allDone}>
      <Icon name="check" size={18} color={c.success} />
      <Type v="bodyMd" style={styles.flex}>
        {t('ev_all_stops_done')}
      </Type>
    </View>
  );
}

/** The auto check-in switch (hidden when nothing is open, the devotee has not joined, or location is denied). */
export function AutoCheckInRow({ s }: { s: RouteSessionValue }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  if (!s.anyOpen || s.joinNeeded || s.perm.status === 'denied') return null;
  return (
    <View style={[styles.auto, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Type v="bodyMd" style={styles.flex}>
        {t('ev_auto_checkin')}
      </Type>
      <Switch value={s.auto} onValueChange={s.setAuto} accessibilityLabel={t('ev_auto_checkin')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  progress: { borderRadius: Radius.lg, borderWidth: 1, padding: 14, gap: 10 },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg, borderWidth: 1, paddingLeft: 14, paddingRight: 10, paddingVertical: 4 },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
