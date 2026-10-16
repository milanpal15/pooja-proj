import { StyleSheet, View } from 'react-native';

import { formatDistance } from '@/components/map/distance';
import { Button, Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

import type { CheckInMessage } from '../../hooks/use-check-in';
import type { LocationPermission } from '../../hooks/use-location-permission';
import { fill, shortDate } from '../../lib/events-logic';
import { canCheckIn, kmText, placeLabel, type ResolvedStop, stopKey } from '../../lib/route';

export type StopCardProps = {
  stop: ResolvedStop;
  /** Metres from the devotee to the stop, when a fix exists. */
  distanceM: number | null;
  accuracyM: number | null;
  permission: LocationPermission;
  /** The event needs a registration the devotee does not have. */
  joinNeeded: boolean;
  busy: boolean;
  message: CheckInMessage | null;
  onCheckIn: () => void;
  onDirections: () => void;
  onOpenSettings: () => void;
};

/**
 * The card under the map for one stop (the next one by default; any tapped stop). Check in is enabled
 * when the on-device distance is within radius + min(accuracy, 50 m) — the server still decides — or
 * while location has not been allowed yet (pressing it then raises the rationale).
 */
export function StopCard(p: StopCardProps) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const { stop } = p;
  const name = placeLabel(stop, lang);
  const open = stop.state === 'next' || stop.state === 'open';
  const granted = p.permission === 'granted';
  const near = canCheckIn(p.distanceM, stop.radiusM, p.accuracyM);
  const message = p.message && p.message.forKey === stopKey(stop) ? p.message : null;
  const radius = formatDistance(stop.radiusM, lang);

  let distanceLine = '';
  if (open && granted) distanceLine = p.distanceM == null ? t('ev_loc_finding') : fill(t('ev_stop_away'), { d: formatDistance(p.distanceM, lang) });

  const tone = stop.state === 'done' ? c.success : stop.state === 'locked' ? c.onSurfaceFaint : c.accent;

  return (
    <View
      accessibilityLabel={`${fill(t('ev_stop_n'), { n: stop.order })}. ${name}`}
      style={[styles.card, { backgroundColor: c.containerLowest, borderColor: stop.state === 'next' ? c.accent : c.outlineVariant }]}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: tone }]}>
          {stop.state === 'done' ? (
            <Icon name="check" size={16} color="#FFFFFF" />
          ) : (
            <Type v="labelMd" color="#FFFFFF" numeric>
              {stop.order}
            </Type>
          )}
        </View>
        <View style={styles.flex}>
          <Type v="labelSm" tone="onSurfaceVariant">
            {(stop.state === 'next' ? t('ev_stop_next') : fill(t('ev_stop_n'), { n: stop.order })).toUpperCase()}
          </Type>
          <Type v="titleMd" numberOfLines={2}>
            {name}
          </Type>
        </View>
      </View>

      {!!stop.note && (
        <Type v="bodyMd" tone="onSurfaceVariant">
          {stop.note}
        </Type>
      )}
      <Type v="bodySm" tone="onSurfaceVariant" numeric>
        {fill(t('ev_stop_km'), { km: kmText(stop.routeKm) })}
      </Type>

      {stop.state === 'done' && (
        <Type v="titleSm" color={c.success}>
          {stop.completedAt ? fill(t('ev_stop_reached_on'), { date: shortDate(stop.completedAt) }) : t('ev_stop_reached')}
        </Type>
      )}
      {stop.state === 'locked' && (
        <Type v="titleSm" tone="onSurfaceVariant">
          {t('ev_stop_locked')}
        </Type>
      )}

      {open && p.joinNeeded && (
        <Type v="bodySm" tone="onSurfaceVariant">
          {t('ev_task_join_first')}
        </Type>
      )}

      {open && !p.joinNeeded && (
        <>
          {!!distanceLine && (
            <Type v="titleSm" numeric>
              {distanceLine}
            </Type>
          )}
          {granted && p.distanceM != null && !near && (
            <Type v="bodySm" tone="onSurfaceVariant">
              {fill(t('ev_stop_get_within'), { r: radius })}
            </Type>
          )}
          {message && (
            <Type v="bodySm" color={c.error} accessibilityLiveRegion="polite">
              {fill(t(message.failure.key), message.failure.vars)}
            </Type>
          )}
          {p.permission === 'denied' && !p.busy && (
            <View style={styles.denied}>
              <Type v="bodySm" tone="onSurfaceVariant">
                {t('ev_loc_denied')}
              </Type>
              <Button label={t('ev_loc_open_settings')} variant="outline" size="sm" icon="settings" onPress={p.onOpenSettings} />
            </View>
          )}
        </>
      )}

      <View style={styles.actions}>
        {open && !p.joinNeeded && p.permission !== 'denied' && (
          <Button
            label={p.busy ? t('ev_checking_in') : t('ev_checkin')}
            size="sm"
            icon="mapPin"
            loading={p.busy}
            disabled={p.busy || (granted && !near)}
            onPress={p.onCheckIn}
          />
        )}
        <Button label={t('ev_directions')} variant="outline" size="sm" icon="arrowRight" onPress={p.onDirections} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: 1.5, padding: 14, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  denied: { gap: 6, alignItems: 'flex-start' },
});
