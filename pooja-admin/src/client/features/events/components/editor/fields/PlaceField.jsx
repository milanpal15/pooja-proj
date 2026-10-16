import { useState } from 'react';

import { MapView, Field } from '../../../../../ui/index.js';
import { distanceLabel, kmLabel, snapToPath } from '../../../../../lib/geo.js';
import { RADIUS_DEFAULT, RADIUS_MAX, RADIUS_MIN, effectivePath, geoProblems, stopPlacement, stopPoint, stopsOf, warningText, warningsByStop } from '../../../lib/route.js';
import { useEd } from '../EditorContext.js';
import { CoordBox } from './CoordBox.jsx';

const SNAP_PX = 24; // a click this close to the path lands on it
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * A place on the map for a task: pin (click or drag), radius circle, paste
 * coordinates, name and note. When the event has a route the path is drawn
 * and a pin placed near it snaps onto it, showing the km along the path.
 * Everything is also reachable with the keyboard through the number boxes.
 */
export function PlaceField({ keys, config, onChange, path }) {
  const { d, lookups, ro, dis, err, warnings } = useEd();
  const [fitN, setFitN] = useState(0);
  const [mapState, setMapState] = useState('loading');
  const has = (k) => keys.includes(k);
  const point = stopPoint(config);
  const route = d.blocks.includes('route') ? d.route : null;
  const line = route ? effectivePath(route) : [];
  const radiusM = Number(config.radiusM) > 0 ? Number(config.radiusM) : RADIUS_DEFAULT;
  const place = route && point ? stopPlacement(config, route) : null;
  const m = path.match(/milestones\.items\.(\d+)\.tasks\.(\d+)/);
  const here = m ? `${m[1]}:${m[2]}` : '';
  const serverWarn = here ? warningsByStop(warnings, d.milestones.items)[here] : null;
  const offRoute = place && place.offRouteM > 1000 ? { code: 'off_route', distanceM: place.offRouteM } : null;
  const warn = offRoute || serverWarn;

  const put = (patch) => onChange({ ...config, ...patch });
  const setPoint = (lat, lng, mPerPx, fit) => {
    let p = [lat, lng];
    if (line.length > 1 && mPerPx) p = snapToPath(line, p, SNAP_PX * mPerPx).point;
    put({ lat: r6(p[0]), lng: r6(p[1]) });
    if (fit) setFitN((n) => n + 1);
  };
  const problems = { ...geoProblems(config, keys) };
  const show = (k) => err(`${path}.${k}`);
  const otherStops = route ? stopsOf(d.milestones.items, route, lookups.kinds).filter((s) => s.point && `${s.mi}:${s.ti}` !== here) : [];

  const fit = [...(point ? [point] : []), ...line];
  return (
    <div className="ev-place">
      <p className="ev-place__warn">Location can be faked; use it for small rewards.</p>
      <MapView ariaLabel="Map: set the place for this task" height={320} onStatus={setMapState}
        fit={fit} fitKey={`${fitN}:${route ? 'r' : ''}`}
        lines={line.length > 1 ? [{ id: 'path', coords: line, color: '#7a5a12', width: 4, dashed: true }] : []}
        circles={point ? [{ id: 'radius', center: point, radiusM, color: '#af101a' }] : []}
        markers={[
          ...(route ? [route.start, route.end].map((p, i) => ({ id: i ? 'end' : 'start', lat: p.lat, lng: p.lng, label: i ? 'E' : 'S', tone: i ? 'end' : 'start', title: i ? 'Route end' : 'Route start' })) : []),
          ...otherStops.map((s) => ({ id: `s${s.mi}-${s.ti}`, lat: s.point[0], lng: s.point[1], label: String(s.mi + 1), tone: 'stop', title: s.name })),
          ...(point ? [{ id: 'place', lat: point[0], lng: point[1], label: '●', tone: 'place', draggable: !ro, title: 'This place. Drag to move.' }] : []),
        ]}
        onClick={ro ? undefined : (e) => setPoint(e.lat, e.lng, e.mPerPx)}
        onMarkerDrag={ro ? undefined : (id, e) => { if (id === 'place') setPoint(e.lat, e.lng, e.mPerPx); }} />
      {mapState === 'ready' && !ro && <p className="ui-field__hint">{route && line.length > 1 ? 'Click the map to place the pin. Near the dashed path it snaps onto it.' : 'Click the map to place the pin, or drag it.'}</p>}
      <div className="hs-pair">
        <Field label="Latitude" type="number" step="any" value={config.lat ?? ''} error={show('lat') || (config.lat !== '' && config.lat != null ? problems.lat : '')} onChange={(v) => { put({ lat: v }); }} {...dis} />
        <Field label="Longitude" type="number" step="any" value={config.lng ?? ''} error={show('lng') || (config.lng !== '' && config.lng != null ? problems.lng : '')} onChange={(v) => { put({ lng: v }); }} {...dis} />
      </div>
      <CoordBox label="Paste coordinates" hint="As copied from any maps app, for example 19.0760, 72.8777" lat={config.lat} lng={config.lng} disabled={ro}
        onCommit={(p) => { onChange({ ...config, lat: r6(p.lat), lng: r6(p.lng) }); setFitN((n) => n + 1); }} />
      {has('radiusM') && (
        <div className="ui-field">
          <label className="ui-field__label" htmlFor={`${path}-radius`}>Check-in radius: <b>{radiusM} m</b></label>
          <input id={`${path}-radius`} className="ev-place__range" type="range" min={RADIUS_MIN} max={RADIUS_MAX} step="10" value={radiusM} disabled={ro}
            onChange={(e) => put({ radiusM: Number(e.target.value) })} aria-valuetext={`${radiusM} metres`} />
          <p className={show('radiusM') ? 'ui-field__error' : 'ui-field__hint'}>{show('radiusM') || `A devotee must be within this distance (${RADIUS_MIN} to ${RADIUS_MAX} m). The circle on the map shows it.`}</p>
        </div>
      )}
      {place && (
        <p className="ev-place__km" data-testid="place-km">
          <b>{kmLabel(place.routeKm)}</b> along the path{place.offRouteM != null && place.offRouteM > 5 ? ` · ${distanceLabel(place.offRouteM)} from it` : ' · on the path'}{place.fromServer ? '' : ' (updates when saved)'}
        </p>
      )}
      {warn && <p className="ev-place__offroute" role="status">{warningText(warn)}</p>}
      {has('name') && <Field label="Place name" value={config.name ?? ''} error={show('name')} onChange={(v) => put({ name: v })} {...dis} />}
      {has('nameHi') && <Field label="Place name (Hindi)" value={config.nameHi ?? ''} error={show('nameHi')} onChange={(v) => put({ nameHi: v })} {...dis} />}
      {has('note') && <Field label="Note on the pin" hint="Optional, up to 160 characters. For example “Darshan at the main gate”." value={config.note ?? ''} error={show('note')} onChange={(v) => put({ note: v })} {...dis} />}
    </div>
  );
}
