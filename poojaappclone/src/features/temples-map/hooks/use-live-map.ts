import type { CameraRef, ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, type NativeSyntheticEvent } from 'react-native';

import type { Temple } from '@/constants/temples';
import { useGrantedLocation } from '@/hooks/use-granted-location';
import { useLocation } from '@/hooks/use-location';
import { useLanguage } from '@/i18n';
import type { NearbyTemple } from '@/lib/api';
import { useToast } from '@/components/ui';
import { useContent } from '@/providers/content';

import {
  DEFAULT_RADIUS_M,
  FIT_PADDING,
  FOCUS_ZOOM,
  INDIA_BOUNDS,
  MIN_FIT_SPAN_DEG,
  SEARCH_MIN_ZOOM,
  VIEW_DEBOUNCE_MS,
} from '../constants/map';
import { boundsOf, type LatLng, radiusForBounds, type SearchArea, shouldOfferSearch } from '@/components/map/geometry';
import { openDirections as openMapsApp } from '@/components/map/open-directions';
import { mappableTemples } from '../lib/places-geojson';
import { useNearbyPlaces } from './use-nearby-places';

type Selection = { kind: 'managed'; id: string } | { kind: 'place'; id: string };
type View = SearchArea & { zoom: number };

/**
 * Everything the live map screen decides, apart from drawing it:
 *  - where the camera starts (user fix, else the dashboard temples, else India),
 *  - when to search (first fix, the Search-this-area button, Near me — never on pan),
 *  - what is selected, and the Directions hand-off.
 * Location permission is requested ONLY by `locate()` (the Near me button), never on mount; an
 * already-granted permission is used silently via `useGrantedLocation`.
 */
export function useLiveMap() {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const { templeList } = useContent();
  const granted = useGrantedLocation();
  const loc = useLocation();
  const nearby = useNearbyPlaces();
  const { search } = nearby;

  const user: LatLng | null = loc.state.status === 'granted' ? loc.state.coords : granted;
  const mappable = useMemo(() => mappableTemples(templeList), [templeList]);

  const cameraRef = useRef<CameraRef | null>(null);
  const [ready, setReady] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const userMoved = useRef(false);
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSearched = useRef(false);
  const wantsLocate = useRef(false);

  // Camera commands before the map has loaded throw inside MapLibre; never let that reach the UI.
  const camera = useCallback((run: (c: CameraRef) => void) => {
    try {
      if (cameraRef.current) run(cameraRef.current);
    } catch {
      /* map not ready yet — the initial-view effect re-runs once it is */
    }
  }, []);

  const flyToPoint = useCallback(
    (p: LatLng, zoom: number = FOCUS_ZOOM) =>
      camera((c) => c.flyTo({ center: [p.lng, p.lat], zoom, duration: 900 })),
    [camera],
  );

  // First view. Re-runs when a fix or the dashboard temples arrive — until the devotee moves the map.
  useEffect(() => {
    if (!ready || userMoved.current) return;
    if (user) {
      camera((c) => c.jumpTo({ center: [user.lng, user.lat], zoom: FOCUS_ZOOM }));
      return;
    }
    const b = boundsOf(
      mappable.map((x) => x.coords),
      MIN_FIT_SPAN_DEG,
    );
    camera((c) => c.fitBounds(b ?? INDIA_BOUNDS, { padding: FIT_PADDING, duration: 0 }));
  }, [ready, user, mappable, camera]);

  // The first position we get (granted silently, or after Near me) is searched once.
  useEffect(() => {
    if (!user || autoSearched.current) return;
    autoSearched.current = true;
    void search({ ...user, radius: DEFAULT_RADIUS_M });
  }, [user, search]);

  // Result of an explicit Near me tap.
  useEffect(() => {
    if (!wantsLocate.current) return;
    const s = loc.state;
    if (s.status === 'granted') {
      wantsLocate.current = false;
      userMoved.current = true;
      flyToPoint(s.coords);
    } else if (s.status === 'denied') {
      wantsLocate.current = false;
      toast.error(t('location_denied'));
    } else if (s.status === 'unavailable') {
      wantsLocate.current = false;
      toast.error(t('location_unavailable'));
    }
  }, [loc.state, flyToPoint, toast, t]);

  const locate = useCallback(() => {
    if (user) {
      userMoved.current = true;
      flyToPoint(user);
      if (nearby.status !== 'loading') void search({ ...user, radius: DEFAULT_RADIUS_M });
      return;
    }
    wantsLocate.current = true;
    void loc.request();
  }, [user, flyToPoint, nearby.status, search, loc]);

  const fitAll = useCallback(() => {
    userMoved.current = true;
    const b = boundsOf(
      mappable.map((x) => x.coords),
      MIN_FIT_SPAN_DEG,
    );
    camera((c) => c.fitBounds(b ?? INDIA_BOUNDS, { padding: FIT_PADDING, duration: 800 }));
  }, [mappable, camera]);

  // The camera settled: remember where, debounced, so the search button can decide.
  const onRegionDidChange = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const v = e.nativeEvent;
    if (v.userInteraction) userMoved.current = true;
    if (viewTimer.current) clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => {
      setView({
        lat: v.center[1],
        lng: v.center[0],
        zoom: v.zoom,
        radius: radiusForBounds(v.bounds),
      });
    }, VIEW_DEBOUNCE_MS);
  }, []);
  useEffect(
    () => () => {
      if (viewTimer.current) clearTimeout(viewTimer.current);
    },
    [],
  );

  const offerSearch = nearby.status !== 'loading' && shouldOfferSearch(nearby.searched, view, SEARCH_MIN_ZOOM);
  const zoomHint = nearby.status === 'idle' && !!view && view.zoom < SEARCH_MIN_ZOOM;

  const searchHere = useCallback(() => {
    if (!view) return;
    void search({ lat: view.lat, lng: view.lng, radius: Math.max(view.radius, 2000) });
  }, [view, search]);

  const retry = useCallback(() => {
    void search(nearby.failedArea ?? { ...(user ?? { lat: view?.lat ?? 0, lng: view?.lng ?? 0 }), radius: DEFAULT_RADIUS_M });
  }, [search, nearby.failedArea, user, view]);

  // Selection ------------------------------------------------------------------------------------
  const selectedTemple: Temple | null =
    selection?.kind === 'managed' ? (templeList.find((x) => x.id === selection.id) ?? null) : null;
  const selectedPlace: NearbyTemple | null =
    selection?.kind === 'place' ? (nearby.places.find((p) => p.id === selection.id) ?? null) : null;
  const selectedPoint: LatLng | null = selectedTemple?.coords ?? selectedPlace ?? null;

  const select = useCallback(
    (next: Selection, at: LatLng) => {
      setSelection(next);
      userMoved.current = true;
      camera((c) => c.easeTo({ center: [at.lng, at.lat], zoom: Math.max(view?.zoom ?? 0, 11), duration: 500 }));
    },
    [camera, view?.zoom],
  );
  const clearSelection = useCallback(() => setSelection(null), []);

  const onSelectKey = useCallback(
    (key: string) => {
      if (key.startsWith('temple:')) {
        const tpl = templeList.find((x) => `temple:${x.id}` === key);
        if (tpl) select({ kind: 'managed', id: tpl.id }, tpl.coords);
        return;
      }
      const place = nearby.places.find((p) => p.id === key);
      if (place) select({ kind: 'place', id: place.id }, place);
    },
    [templeList, nearby.places, select],
  );

  /** A tapped cluster zooms in to where it breaks apart. */
  const zoomInto = useCallback(
    (center: [number, number], zoom: number) => {
      userMoved.current = true;
      camera((c) => c.easeTo({ center, zoom: zoom + 0.5, duration: 450 }));
    },
    [camera],
  );

  // Android back closes the open sheet before leaving the screen.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!selection) return false;
        setSelection(null);
        return true;
      });
      return () => sub.remove();
    }, [selection]),
  );

  const openDirections = useCallback(
    async (p: { lat: number; lng: number; name: string }) => {
      if (!(await openMapsApp(p))) toast.error(t('map_directions_failed'));
    },
    [toast, t],
  );

  return {
    lang,
    cameraRef,
    templeList,
    mappable,
    user,
    nearby,
    locating: loc.state.status === 'locating',
    ready,
    onMapReady: () => {
      setStyleFailed(false);
      setReady(true);
    },
    onMapFailed: () => setStyleFailed(true),
    styleFailed,
    onRegionDidChange,
    selectedTemple,
    selectedPlace,
    selectedPoint,
    onSelectKey,
    clearSelection,
    zoomInto,
    locate,
    fitAll,
    offerSearch,
    zoomHint,
    searchHere,
    retry,
    openDirections,
  } as const;
}

export type LiveMapController = ReturnType<typeof useLiveMap>;
