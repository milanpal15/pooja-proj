import type * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { maplibre } from '@/components/map/maplibre';
import { openDirections } from '@/components/map/open-directions';
import { useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { EventDetail, EventRoute, ProgressResponse } from '@/lib/api';

import { useCheckIn } from '../../hooks/use-check-in';
import { useForeground } from '../../hooks/use-foreground';
import { useLocationPermission } from '../../hooks/use-location-permission';
import { useRouteWatch } from '../../hooks/use-route-watch';
import { needsJoin } from '../../lib/progress';
import {
  autoCheckInTarget,
  distanceToStop,
  type Fix,
  nextStop,
  openStops,
  placeLabel,
  reportFromPosition,
  type ResolvedStop,
  resolveStops,
  stopKey,
} from '../../lib/route';
import { type BannerMode, bannerMode, fullscreenOpen, mapHost, type MapHost } from '../../lib/route-view';

export type RouteSessionValue = {
  event: EventDetail;
  route: EventRoute;
  stops: ResolvedStop[];
  selected: ResolvedStop | null;
  /** The stop whose reach circle is drawn. */
  focus: ResolvedStop | null;
  select: (key: string | null) => void;
  user: { lat: number; lng: number } | null;
  accuracyM: number | null;
  perm: ReturnType<typeof useLocationPermission>;
  checkIn: ReturnType<typeof useCheckIn>;
  joinNeeded: boolean;
  anyOpen: boolean;
  auto: boolean;
  setAuto: (v: boolean) => void;
  distanceM: number | null;
  onDirections: (stop: ResolvedStop) => void;
  labels: { start: string; end: string };
  mode: BannerMode;
  host: MapHost;
  fullscreen: boolean;
  openFullscreen: () => void;
  closeFullscreen: () => void;
  failMap: () => void;
};

const Ctx = createContext<RouteSessionValue | null>(null);

/** The shared Yatra state, or null for an event without a route. */
export const useRouteSession = () => useContext(Ctx);

type Props = {
  event: EventDetail;
  onProgress: (milestoneKey: string, res: ProgressResponse) => void;
  reload: () => void;
  children: React.ReactNode;
};

/** Mounts the session only for an event that has a route; otherwise just the children. */
export function RouteSession(p: Props) {
  const route = p.event.route;
  if (!route) return <>{p.children}</>;
  return <Session {...p} route={route} />;
}

/**
 * The ONE controller behind the banner map, the Route block and the full-screen view (docs/EVENTS.md
 * §11.4): selected stop, check-in, location permission, the single foreground watcher, the latest fix,
 * auto check-in, and which view hosts the map.
 *
 * Location is read only while this screen is focused AND the app is in the foreground AND some stop is
 * open AND the devotee has joined; the watcher (`useRouteWatch`) is removed the moment any of that stops
 * being true. It is not started until permission is already granted — the first "Check in" press raises
 * the rationale. There is exactly one watcher, here, however many views show the route.
 */
function Session({ event, route, onProgress, reload, children }: Props & { route: EventRoute }) {
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
    [onProgress, setSelectedKey],
  );
  const checkIn = useCheckIn({ event, perm, onProgress: handleProgress, reload });

  const [auto, setAuto] = useState(true);
  const [fix, setFix] = useState<(Fix & { accuracyM: number | null }) | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [fsRequested, setFsRequested] = useState(false);

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
    async (s: ResolvedStop) => {
      if (!(await openDirections({ lat: s.lat, lng: s.lng, name: placeLabel(s, lang) }))) toast.error(t('map_directions_failed'));
    },
    [toast, t, lang],
  );

  const mode = bannerMode({ hasRoute: true, mapAvailable: !!maplibre, mapFailed });
  const fullscreen = fullscreenOpen(fsRequested, mode);
  const host = mapHost({ mode, fullscreenOpen: fullscreen });
  const labels = useMemo(() => ({ start: placeLabel(route.start, lang) || t('ev_route_start'), end: placeLabel(route.end, lang) || t('ev_route_end') }), [route.start, route.end, lang, t]);

  const value: RouteSessionValue = {
    event,
    route,
    stops,
    selected,
    focus,
    select: setSelectedKey,
    user,
    accuracyM: fix?.accuracyM ?? null,
    perm,
    checkIn,
    joinNeeded,
    anyOpen,
    auto,
    setAuto,
    distanceM: selected ? distanceToStop(user, selected) : null,
    onDirections: (s) => void onDirections(s),
    labels,
    mode,
    host,
    fullscreen,
    openFullscreen: () => setFsRequested(true),
    closeFullscreen: () => setFsRequested(false),
    failMap: () => setMapFailed(true),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
