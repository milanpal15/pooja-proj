import { useRef, useState } from 'react';

import { Badge, Banner, Button, Card, Field, IconButton, MapView, Segmented, Skeleton } from '../../../../ui/index.js';
import { cumulativeM, kmLabel, nearestOnPath } from '../../../../lib/geo.js';
import { milestonePct } from '../../lib/events.js';
import {
  MAX_VIA, REVEAL, effectivePath, isInPathOrder, orderMilestonesByRoute, routeBounds, routeLengthKm, stopsInPathOrder, stopsOf, warningText, warningsByStop,
} from '../../lib/route.js';
import { useEd } from './EditorContext.js';
import { CoordBox } from './fields/CoordBox.jsx';

const SNAP_PX = 14;
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const MODES = [
  { value: 'start', label: 'Set start' },
  { value: 'end', label: 'Set end' },
  { value: 'path', label: 'Draw path' },
];
const VIEWS = [
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Phone preview' },
];

/**
 * The Route section (docs/EVENTS.md §11.3), shown when the "Route" section is
 * on: named start and end pins, a path drawn by clicking, its length, the
 * stops along it in path order, and the same polyline / numbered pins the
 * phone draws. Every map action has a keyboard path: pins and path points are
 * also edited as coordinates, and the points list has remove buttons.
 */
export function RouteCard({ stats }) {
  const { d, setBlock, ro, dis, errors, lookups, warnings } = useEd();
  const route = d.route;
  const [view, setView] = useState('edit');
  const [mode, setMode] = useState(route.start.lat == null ? 'start' : route.end.lat == null ? 'end' : 'path');
  const [fitN, setFitN] = useState(0);
  const [hist, setHist] = useState(0);
  const history = useRef([]);
  const [mapState, setMapState] = useState('loading');

  const path = effectivePath(route);
  const items = d.milestones.items;
  const stops = stopsOf(items, route, lookups.kinds);
  const placed = stopsInPathOrder(stops);
  const unplaced = stops.filter((s) => !s.point);
  const km = routeLengthKm(route);
  const cum = cumulativeM(path);
  const warnBy = warningsByStop(warnings, items);
  const routeErrors = Object.entries(errors).filter(([k]) => k.startsWith('route'));
  const ordered = isInPathOrder(items, route, lookups.kinds);
  const editing = !ro && view === 'edit';

  const commit = (next, refit = false) => {
    history.current.push(route);
    if (history.current.length > 60) history.current.shift();
    setHist(history.current.length);
    setBlock('route', next);
    if (refit) setFitN((n) => n + 1);
  };
  const undo = () => {
    const prev = history.current.pop();
    setHist(history.current.length);
    if (prev) { setBlock('route', prev); setFitN((n) => n + 1); }
  };
  const setPin = (which, patch) => commit({ ...route, [which]: { ...route[which], ...patch } });
  const setVia = (via) => commit({ ...route, via });
  const reverse = () => commit({ ...route, start: route.end, end: route.start, via: route.via.slice().reverse() }, true);
  const clear = () => commit({ ...route, via: [] });

  const onMapClick = ({ lat, lng, mPerPx }) => {
    const pt = [r6(lat), r6(lng)];
    if (mode === 'start') { setPin('start', { lat: pt[0], lng: pt[1] }); if (route.end.lat == null) setMode('end'); else setMode('path'); return; }
    if (mode === 'end') { setPin('end', { lat: pt[0], lng: pt[1] }); setMode('path'); return; }
    if (route.via.length >= MAX_VIA) return;
    const near = path.length > 1 ? nearestOnPath(path, pt) : null;
    if (near && near.distanceM <= SNAP_PX * mPerPx) {
      // Clicking ON the line inserts a point there instead of appending.
      const at = near.segment + (route.start.lat == null ? 1 : 0);
      setVia([...route.via.slice(0, at), pt, ...route.via.slice(at)]);
    } else setVia([...route.via, pt]);
  };
  const onDrag = (id, { lat, lng }) => {
    const pt = [r6(lat), r6(lng)];
    if (id === 'start' || id === 'end') setPin(id, { lat: pt[0], lng: pt[1] });
    else if (id.startsWith('v')) setVia(route.via.map((v, i) => (i === Number(id.slice(1)) ? pt : v)));
  };

  const orderNow = () => setBlock('milestones', { items: orderMilestonesByRoute(items, route, lookups.kinds) });

  const stat = (key) => stats?.data?.perMilestone?.find?.((m) => m.key === key);
  const unlockedOnly = route.mapReveal === 'unlocked';
  const previewStops = view === 'preview' && unlockedOnly ? placed.slice(0, 1) : placed;

  const lines = path.length > 1 ? [{ id: 'path', coords: path, color: view === 'preview' ? '#c9a227' : '#af101a', width: 4, dashed: view === 'preview' }] : [];
  const markers = [
    ...(route.start.lat != null ? [{ id: 'start', lat: route.start.lat, lng: route.start.lng, label: 'S', tone: 'start', draggable: editing, title: `Start: ${route.start.name || 'unnamed'}` }] : []),
    ...(route.end.lat != null ? [{ id: 'end', lat: route.end.lat, lng: route.end.lng, label: 'E', tone: 'end', draggable: editing, title: `End: ${route.end.name || 'unnamed'}` }] : []),
    ...(editing ? route.via.map((v, i) => ({ id: `v${i}`, lat: v[0], lng: v[1], tone: 'vertex', draggable: true, title: `Path point ${i + 1}. Drag to move.` })) : []),
    ...previewStops.map((s, i) => ({ id: `s${s.mi}-${s.ti}`, lat: s.point[0], lng: s.point[1], label: String(s.order), tone: view === 'preview' && i === 0 ? 'next' : 'stop', title: `${s.order}. ${s.name} (${kmLabel(s.routeKm)})` })),
  ];
  const circles = view === 'preview' && previewStops[0] ? [{ id: 'next', center: previewStops[0].point, radiusM: previewStops[0].radiusM, color: '#ff9800' }] : [];
  const bounds = routeBounds(route, placed);
  const fit = bounds ? [bounds[0].slice().reverse(), bounds[1].slice().reverse()] : [];

  return (
    <Card title="Route" description="A journey from a start to an end along a path you draw. Milestones that are a place become the stops on it; the app shows the path, the stops and the devotee's progress along it.">
      <div className="hs-form ev-route">
        {routeErrors.length > 0 && (
          <Banner tone="error"><ul className="ev-errors">{routeErrors.map(([k, v]) => <li key={k}>{k.replace(/\./g, ' › ')}: {v}</li>)}</ul></Banner>
        )}
        <div className="hs-pair">
          <PinFields which="start" title="Start" pin={route.start} onChange={(p) => setPin('start', p)} onPlace={() => setFitN((n) => n + 1)} />
          <PinFields which="end" title="End" pin={route.end} onChange={(p) => setPin('end', p)} onPlace={() => setFitN((n) => n + 1)} />
        </div>

        <div className="ev-route__bar">
          <Segmented label="Map view" options={VIEWS} value={view} onChange={(v) => { setView(v); setFitN((n) => n + 1); }} />
          {editing && <Segmented label="What a map click does" options={MODES} value={mode} onChange={setMode} />}
        </div>
        <MapView ariaLabel="Route map" height={420} lines={lines} markers={markers} circles={circles} fit={fit} fitKey={`${fitN}:${view}`} onStatus={setMapState}
          onClick={editing ? onMapClick : undefined} onMarkerDrag={editing ? onDrag : undefined} />
        {mapState === 'ready' && editing && <p className="ui-field__hint">{mode === 'path' ? 'Click to add path points; click on the line to insert one; drag any point to move it.' : `Click the map to place the ${mode}, or drag its pin.`}</p>}
        {view === 'preview' && (
          <p className="ev-route__phone" data-testid="route-progress">0 of {kmLabel(km)} · 0 of {placed.length} {placed.length === 1 ? 'stop' : 'stops'}. {unlockedOnly ? 'Locked stops are hidden until they unlock.' : 'Every stop is shown, locked ones greyed.'} The path fills in gold as stops are reached.</p>
        )}

        <div className="ev-route__len">
          <Badge tone={path.length > 1 ? 'accent' : 'neutral'}>{path.length > 1 ? `${kmLabel(km)} long` : 'No path yet'}</Badge>
          <span className="ui-field__hint">{path.length} {path.length === 1 ? 'point' : 'points'} · computed here as you draw; the server&apos;s figure replaces it after you save.</span>
          {!ro && (
            <span className="ev-route__tools">
              <Button variant="outline" size="sm" disabled={!hist} onClick={undo}>Undo</Button>
              <Button variant="outline" size="sm" disabled={route.start.lat == null || route.end.lat == null} onClick={reverse}>Reverse</Button>
              <Button variant="outline" size="sm" disabled={!route.via.length} onClick={clear}>Clear path points</Button>
            </span>
          )}
        </div>
        <Field label="Locked stops" type="select" value={route.mapReveal} options={REVEAL} onChange={(v) => setBlock('route', { mapReveal: v })} hint="Whether devotees see stops that have not unlocked yet." {...dis} />

        <h4 className="ev-sub">Path points</h4>
        <ol className="ev-route__points" aria-label="Path points">
          <li className="ev-route__pt ev-route__pt--lock"><span className="ev-route__n">S</span><span>{route.start.name || 'Start'} (locked to the start pin)</span><span className="ev-route__km">0.0 km</span></li>
          {route.via.map((v, i) => {
            const at = i + (route.start.lat == null ? 0 : 1);
            return (
              <li key={`${i}-${v[0]}-${v[1]}`} className="ev-route__pt">
                <span className="ev-route__n">{i + 1}</span>
                <CoordBox label={`Path point ${i + 1} coordinates`} hideLabel lat={v[0]} lng={v[1]} disabled={ro} onCommit={(p) => setVia(route.via.map((x, j) => (j === i ? [r6(p.lat), r6(p.lng)] : x)))} />
                <span className="ev-route__km">{kmLabel((cum[at] ?? 0) / 1000)}</span>
                {!ro && <IconButton label={`Remove path point ${i + 1}`} onClick={() => setVia(route.via.filter((_, j) => j !== i))}>×</IconButton>}
              </li>
            );
          })}
          <li className="ev-route__pt ev-route__pt--lock"><span className="ev-route__n">E</span><span>{route.end.name || 'End'} (locked to the end pin)</span><span className="ev-route__km">{path.length > 1 ? kmLabel(km) : '—'}</span></li>
        </ol>
        {!ro && !route.via.length && <p className="ui-field__hint">No points between the start and the end yet: the path is a straight line. Draw it on the map, or add points in “Draw path” mode.</p>}

        <h4 className="ev-sub">Stops along the path · {stops.length}</h4>
        {stops.length === 0 && <p className="ui-field__hint">No stops yet. Add a milestone, choose a task that is a place, and click on the path to place it.</p>}
        <ol className="ev-route__stops" aria-label="Stops in path order">
          {placed.map((s) => {
            const st = stat(items[s.mi].key);
            const w = warnBy[`${s.mi}:${s.ti}`] || (s.offRouteM > 1000 ? { code: 'off_route', distanceM: s.offRouteM } : null);
            return (
              <li key={`${s.mi}:${s.ti}`} className="ev-route__stop">
                <span className="ev-route__n">{s.order}</span>
                <span className="ev-route__name"><b>{s.name}</b><span className="ui-field__hint">Milestone {s.mi + 1}{s.title ? ` · ${s.title}` : ''}</span></span>
                <span className="ev-route__km">{kmLabel(s.routeKm)}</span>
                <span className="ev-route__done">{stats?.status === 'loading' ? <Skeleton width="40px" /> : st?.completedCount == null ? '—' : `${st.completedCount} done${milestonePct(stats.data, items[s.mi].key) == null ? '' : ` · ${milestonePct(stats.data, items[s.mi].key)}%`}`}</span>
                {w && <span className="ev-route__warn" role="status">{warningText(w)}</span>}
              </li>
            );
          })}
          {unplaced.map((s) => (
            <li key={`${s.mi}:${s.ti}`} className="ev-route__stop ev-route__stop--none">
              <span className="ev-route__n">–</span>
              <span className="ev-route__name"><b>{s.name}</b><span className="ui-field__hint">Milestone {s.mi + 1} has no place set yet</span></span>
            </li>
          ))}
        </ol>
        {!ro && stops.length > 1 && (
          <div className="ev-route__order">
            <Button variant="outline" disabled={ordered} onClick={orderNow}>Order stops along the path</Button>
            <span className="ui-field__hint">{ordered ? 'The milestones already follow the path.' : 'Reorders the milestones that are stops by km along the path. Other milestones keep their places. Nothing is reordered until you click.'}</span>
          </div>
        )}
        <p className="ui-field__hint">Devotees&apos; own locations are never shown or stored here; only counts of who reached each stop.</p>
      </div>
    </Card>
  );
}

/** Start or end: a name (English and Hindi) and the place, as coordinates or from the map. */
function PinFields({ which, title, pin, onChange, onPlace }) {
  const { ro, dis, err } = useEd();
  return (
    <fieldset className="ev-route__pin">
      <legend>{title}</legend>
      <Field label={`${title} name`} value={pin.name} error={err(`route.${which}.name`)} onChange={(v) => onChange({ name: v })} {...dis} />
      <Field label={`${title} name (Hindi)`} value={pin.nameHi} error={err(`route.${which}.nameHi`)} onChange={(v) => onChange({ nameHi: v })} {...dis} />
      <CoordBox label={`${title} coordinates`} lat={pin.lat} lng={pin.lng} disabled={ro} error={err(`route.${which}.point`)} hint="Paste from a maps app, or place it on the map." onCommit={(p) => { onChange({ lat: r6(p.lat), lng: r6(p.lng) }); onPlace(); }} />
    </fieldset>
  );
}
