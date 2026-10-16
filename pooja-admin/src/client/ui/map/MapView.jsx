import { useEffect, useRef, useState } from 'react';

import { boundsOf, circleRing, metresPerPixel } from '../../lib/geo.js';
import { MAP_STYLE_URL } from '../../lib/map-config.js';

/**
 * A map (MapLibre GL, OpenFreeMap style, no key) that draws what it is given
 * and reports what the operator does. It owns no domain meaning: callers pass
 * lines, circles and markers and handle `onClick` / `onMarkerDrag`.
 *
 * - The library (and its CSS) is loaded on first mount, so it is not in the
 *   main bundle.
 * - If the style or WebGL cannot load, an inline error replaces the map and
 *   `onStatus('error')` fires; callers keep their coordinate inputs as the way in.
 * - Points are `[lat, lng]`; MapLibre's `[lng, lat]` never leaves this file.
 *
 * @typedef {Object} MapLine   { id, coords:[[lat,lng]...], color, width?, dashed? }
 * @typedef {Object} MapCircle { id, center:[lat,lng], radiusM, color }
 * @typedef {Object} MapMarker { id, lat, lng, label?, tone?: 'start'|'end'|'stop'|'next'|'done'|'place'|'vertex', draggable?, title? }
 *
 * @param {Object} props
 * @param {string} props.ariaLabel
 * @param {number|string} [props.height=360]
 * @param {MapLine[]} [props.lines]
 * @param {MapCircle[]} [props.circles]
 * @param {MapMarker[]} [props.markers]
 * @param {Array<[number, number]>} [props.fit]       points to frame; re-framed when `fitKey` changes
 * @param {string} [props.fitKey]
 * @param {(e: {lat:number,lng:number,mPerPx:number}) => void} [props.onClick]
 * @param {(id: string, e: {lat:number,lng:number,mPerPx:number}) => void} [props.onMarkerDrag]  at drag end
 * @param {(id: string) => void} [props.onMarkerClick]
 * @param {(s: 'loading'|'ready'|'error') => void} [props.onStatus]
 */
export function MapView({ ariaLabel, height = 360, lines = [], circles = [], markers = [], fit, fitKey = '', onClick, onMarkerDrag, onMarkerClick, onStatus, className = '' }) {
  const box = useRef(null);
  const live = useRef({});
  const ctx = useRef({ map: null, lib: null, pins: new Map(), ready: false, fitted: null });
  const [state, setState] = useState({ status: 'loading', message: '', tiles: false });
  live.current = { lines, circles, markers, fit, fitKey, onClick, onMarkerDrag, onMarkerClick, onStatus };

  const setStatus = (status, message = '') => {
    setState((s) => ({ ...s, status, message }));
    live.current.onStatus?.(status);
  };

  const sync = () => {
    const c = ctx.current;
    const { map, lib } = c;
    if (!map || !lib || !c.ready) return;
    const p = live.current;

    const features = p.lines.filter((l) => l.coords?.length > 1).map((l) => ({
      type: 'Feature', properties: { color: l.color || '#af101a', width: l.width || 4, dash: l.dashed ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: l.coords.map(([lat, lng]) => [lng, lat]) },
    }));
    map.getSource('ov-lines')?.setData({ type: 'FeatureCollection', features });
    const rings = p.circles.filter((x) => x.center && x.radiusM > 0).map((x) => ({
      type: 'Feature', properties: { color: x.color || '#af101a' },
      geometry: { type: 'Polygon', coordinates: [circleRing(x.center, x.radiusM)] },
    }));
    map.getSource('ov-circles')?.setData({ type: 'FeatureCollection', features: rings });

    const seen = new Set();
    for (const m of p.markers) {
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
      seen.add(m.id);
      let pin = c.pins.get(m.id);
      if (!pin) {
        // MapLibre owns the outer element's classes and position; the pin is drawn in an inner one.
        const holder = document.createElement('div');
        const el = document.createElement('div');
        holder.appendChild(el);
        holder.addEventListener('click', (ev) => {
          ev.stopPropagation();
          live.current.onMarkerClick?.(m.id);
        });
        const marker = new lib.Marker({ element: holder, draggable: !!m.draggable }).setLngLat([m.lng, m.lat]).addTo(map);
        marker.on('dragend', () => {
          const ll = marker.getLngLat();
          live.current.onMarkerDrag?.(m.id, { lat: ll.lat, lng: ll.lng, mPerPx: metresPerPixel(ll.lat, map.getZoom()) });
        });
        pin = { marker, el };
        c.pins.set(m.id, pin);
      }
      pin.el.className = `ui-map-pin ui-map-pin--${m.tone || 'place'}`;
      pin.el.textContent = m.label ?? '';
      if (m.title) pin.el.title = m.title;
      pin.el.setAttribute('role', 'img');
      pin.el.setAttribute('aria-label', m.title || m.label || 'Map pin');
      pin.marker.setDraggable(!!m.draggable);
      const ll = pin.marker.getLngLat();
      if (ll.lng !== m.lng || ll.lat !== m.lat) pin.marker.setLngLat([m.lng, m.lat]);
    }
    for (const [id, pin] of c.pins) {
      if (!seen.has(id)) { pin.marker.remove(); c.pins.delete(id); }
    }

    if (p.fit?.length && c.fitted !== p.fitKey) {
      c.fitted = p.fitKey;
      const b = boundsOf(p.fit);
      const same = b[0][0] === b[1][0] && b[0][1] === b[1][1];
      if (same) map.jumpTo({ center: b[0], zoom: 15 });
      else map.fitBounds(b, { padding: 56, maxZoom: 16, duration: 0 });
    }
  };

  useEffect(() => {
    let dead = false;
    let timer;
    const c = ctx.current;
    (async () => {
      try {
        const [lib, worker] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'), // bundled by Vite with its imports; the library's own relative worker URL breaks once bundled
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        if (dead) return;
        if (worker?.default && lib.getWorkerUrl?.() !== worker.default) lib.setWorkerUrl(worker.default);
        c.lib = lib;
        const map = new lib.Map({ container: box.current, style: MAP_STYLE_URL, center: [78.96, 22.59], zoom: 3.6, attributionControl: { compact: true } });
        c.map = map;
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
        timer = setTimeout(() => { if (!c.ready && !dead) setStatus('error', 'The map style did not load in time.'); }, 15000);
        map.on('style.load', () => {
          if (dead) return;
          clearTimeout(timer);
          map.addSource('ov-circles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'ov-circles-fill', type: 'fill', source: 'ov-circles', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 } });
          map.addLayer({ id: 'ov-circles-line', type: 'line', source: 'ov-circles', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
          map.addSource('ov-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'ov-lines-solid', type: 'line', source: 'ov-lines', filter: ['==', ['get', 'dash'], 0], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] } });
          map.addLayer({ id: 'ov-lines-dash', type: 'line', source: 'ov-lines', filter: ['==', ['get', 'dash'], 1], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-dasharray': [2, 2] } });
          c.ready = true;
          setStatus('ready');
          sync();
        });
        map.on('click', (e) => live.current.onClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng, mPerPx: metresPerPixel(e.lngLat.lat, map.getZoom()) }));
        map.on('error', (e) => {
          if (dead) return;
          if (!c.ready) setStatus('error', 'The map could not load. Check the internet connection.');
          else if (e?.sourceId || e?.tile) setState((s) => (s.tiles ? s : { ...s, tiles: true }));
        });
      } catch (err) {
        if (!dead) setStatus('error', /webgl/i.test(String(err?.message)) ? 'This browser cannot draw the map (WebGL is off).' : 'The map could not load.');
      }
    })();
    return () => {
      dead = true;
      clearTimeout(timer);
      c.ready = false;
      c.pins.forEach((p) => p.marker.remove());
      c.pins.clear();
      c.map?.remove();
      c.map = null;
      c.fitted = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(sync); // every render: cheap diff of what is drawn
  useEffect(() => {
    const m = ctx.current.map;
    if (m && ctx.current.ready) m.getCanvas().style.cursor = onClick ? 'crosshair' : '';
  }, [onClick, state.status]);

  return (
    <div className={`ui-map ${className}`.trim()} style={{ height }}>
      <div ref={box} className="ui-map__canvas" role="application" aria-label={ariaLabel} />
      {state.status === 'loading' && <div className="ui-map__overlay" role="status">Loading the map…</div>}
      {state.status === 'error' && (
        <div className="ui-map__overlay ui-map__overlay--error" role="alert">
          <b>{state.message || 'The map could not load.'}</b>
          <span>You can still set everything with the coordinate boxes next to the map.</span>
        </div>
      )}
      {state.status === 'ready' && state.tiles && <div className="ui-map__note" role="status">Some map tiles did not load.</div>}
    </div>
  );
}
