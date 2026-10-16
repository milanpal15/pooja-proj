import type * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapBoundary } from '@/components/map/MapBoundary';
import { maplibre } from '@/components/map/maplibre';
import { openDirections } from '@/components/map/open-directions';
import { Icon, ProgressBar, Switch, Type, useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { EventDetail, ProgressResponse } from '@/lib/api';
import { Radius, useTheme } from '@/theme';

import { useCheckIn } from '../hooks/use-check-in';
import { useForeground } from '../hooks/use-foreground';
import { useLocationPermission } from '../hooks/use-location-permission';
import { useRouteWatch } from '../hooks/use-route-watch';
import { fill } from '../lib/events-logic';
import { needsJoin } from '../lib/progress';
import {
  autoCheckInTarget,
  distanceToStop,
  type Fix,
  nextStop,
  openStops,
  placeLabel,
  progressLine,
  reportFromPosition,
  resolveStops,
  stopKey,
} from '../lib/route';
import { LocationRationale } from './LocationRationale';
import { RouteMap } from './route/RouteMap';
import { StopCard } from './route/StopCard';
import { StopList } from './route/StopList';

type Props = { event: EventDetail; onProgress: (milestoneKey: string, res: ProgressResponse) => void; reload: () => void };

/**
 * The `route` block (docs/EVENTS.md §11.4): progress line, the map (or the ordered stop list when the
 * native map is not in this build), the card of the selected stop, and the auto check-in switch.
 *
 * Location is read only while this screen is focused AND the app is in the foreground AND some stop is
 * open; the watcher (`useRouteWatch`) is removed the moment any of that stops being true. It is not
 * started until permission is already granted — the first "Check in" press raises the rationale.
 */
export function RouteBlock({ event, onProgress, reload }: Props) {
  const route = event.route;
  if (!route) return null;
  return <Inner event={event} route={route} onProgress={onProgress} reload={reload} />;
}

function Inner({ event, route, onProgress, reload }: Props & { route: NonNullable<EventDetail['route']> }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const stops = useMemo(() => resolveStops(route.stops), [route.stops]);
  const next = nextStop(stops);
  const anyOpen = openStops(stops).length > 0;
  const joinNeeded = needsJoin(event);

  const foreground = useForeground();
  const perm = useLocationPermission(foreground);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const handleProgress = useCallback(
    (mKey: string, res: ProgressResponse) => {
      setSelectedKey(null); // follow the journey: the card moves on to the new next stop
      onProgress(mKey, res);
    },
    [onProgress],
  );
  const checkIn = useCheckIn({ event, perm, onProgress: handleProgress, reload });

  const [auto, setAuto] = useState(true);
  const [fix, setFix] = useState<(Fix & { accuracyM: number | null }) | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  const watching = perm.status === 'granted' && foreground && anyOpen && !joinNeeded;

  // The latest values, read from the watcher callback without restarting the watcher.
  const live = useRef({ auto, stops });
  useEffect(() => {
    live.current = { auto, stops };
  });

  const { submit, reported, triedAt } = checkIn;
  useRouteWatch(watching, (pos: Location.LocationObject) => {
    const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null, mocked: pos.mocked === true };
    setFix(f);
    const target = autoCheckInTarget({ enabled: live.current.auto, fix: f, stops: live.current.stops, reported: reported.current, triedAt: triedAt.current, now: Date.now() });
    if (target) void submit(target, reportFromPosition(pos));
  });

  const selected = stops.find((s) => stopKey(s) === selectedKey) ?? next ?? null;
  const focus = selected && selected.state !== 'locked' ? selected : next;
  const user = watching && fix ? { lat: fix.lat, lng: fix.lng } : null;

  const onDirections = useCallback(
    async (lat: number, lng: number, name: string) => {
      if (!(await openDirections({ lat, lng, name }))) toast.error(t('map_directions_failed'));
    },
    [toast, t],
  );

  const showMap = !!maplibre && !mapFailed;
  const labels = useMemo(() => ({ start: placeLabel(route.start, lang) || t('ev_route_start'), end: placeLabel(route.end, lang) || t('ev_route_end') }), [route.start, route.end, lang, t]);

  return (
    <View style={styles.wrap}>
      <Type v="titleMd">{t('ev_route')}</Type>

      <View style={[styles.progress, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
        <Type v="titleSm" numeric>
          {progressLine(route.progress, t('ev_route_progress'))}
        </Type>
        <ProgressBar value={route.progress?.doneKm ?? 0} max={route.progress?.totalKm ?? 0} />
      </View>

      {showMap ? (
        <MapBoundary onError={() => setMapFailed(true)}>
          <RouteMap
            route={route}
            stops={stops}
            selectedKey={selected ? stopKey(selected) : null}
            focus={focus}
            user={user}
            lang={lang}
            labels={labels}
            wholeLabel={t('ev_route_whole')}
            a11y={fill(t('ev_route_a11y'), { stops: stops.length })}
            onSelect={setSelectedKey}
            onFailed={() => setMapFailed(true)}
          />
        </MapBoundary>
      ) : (
        <>
          <Type v="bodySm" tone="onSurfaceVariant">
            {t('ev_route_no_map')}
          </Type>
          <StopList stops={stops} selectedKey={selected ? stopKey(selected) : null} user={user} onSelect={setSelectedKey} />
        </>
      )}

      {selected ? (
        <StopCard
          stop={selected}
          distanceM={distanceToStop(user, selected)}
          accuracyM={fix?.accuracyM ?? null}
          permission={perm.status}
          joinNeeded={joinNeeded}
          busy={checkIn.busyKey === stopKey(selected)}
          message={checkIn.message}
          onCheckIn={() => void checkIn.submit(selected)}
          onDirections={() => void onDirections(selected.lat, selected.lng, placeLabel(selected, lang))}
          onOpenSettings={perm.openSettings}
        />
      ) : (
        stops.length > 0 && (
          <View style={styles.allDone}>
            <Icon name="check" size={18} color={c.success} />
            <Type v="bodyMd" style={styles.flex}>
              {t('ev_all_stops_done')}
            </Type>
          </View>
        )
      )}

      {anyOpen && !joinNeeded && perm.status !== 'denied' && (
        <View style={[styles.auto, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
          <Type v="bodyMd" style={styles.flex}>
            {t('ev_auto_checkin')}
          </Type>
          <Switch value={auto} onValueChange={setAuto} accessibilityLabel={t('ev_auto_checkin')} />
        </View>
      )}

      <LocationRationale perm={perm} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  progress: { borderRadius: Radius.lg, borderWidth: 1, padding: 14, gap: 10 },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg, borderWidth: 1, paddingLeft: 14, paddingRight: 10, paddingVertical: 4 },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
