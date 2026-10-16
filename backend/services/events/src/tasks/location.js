import { haversineM, round } from '../lib/geo.js';
import { bilingual, pick, reader } from './kit.js';

/** A fix worse than this (metres) is refused: the circle is only as honest as the GPS. */
export const MAX_ACCURACY_M = 100;
/** A move faster than this (km/h) between two reports is a teleport. */
export const MAX_SPEED_KMH = 250;
/** Speed is only judged over a gap at least this long (seconds). */
export const MIN_GAP_S = 5;
/** A report's own `at` may be this old / this far in the future (ms). */
export const MAX_STALE_MS = 2 * 60_000;
export const MAX_FUTURE_MS = 60_000;

const MESSAGES = {
  mock_location: 'A mocked location cannot be used to check in.',
  weak_fix: 'The GPS signal is too weak to check in.',
  implausible_move: 'That position does not fit your last one.',
  too_far: 'You are not close enough to this place yet.',
};
const refuse = (status, code, extra = {}, point = null) => ({ state: {}, done: false, how: null, refuse: { status, code, extra, message: MESSAGES[code] }, ...(point ? { point } : {}) });
const invalid = () => ({ state: {}, done: false, how: null, invalid: true });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export default {
  kind: 'location',
  title: 'Be at a place',
  interactive: true,
  minAppVersion: '1.1.0',
  needsPoint: true, // the engine hands evaluate the devotee's previous point (ctx.prev) and stores the new one (out.point)
  configSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', title: 'Latitude', minimum: -90, maximum: 90 },
      lng: { type: 'number', title: 'Longitude', minimum: -180, maximum: 180 },
      radiusM: { type: 'integer', title: 'Radius (metres)', minimum: 50, maximum: 2000, default: 150 },
      name: { type: 'string', title: 'Place name', maxLength: 80 },
      nameHi: { type: 'string', title: 'Place name (Hindi)', maxLength: 80 },
      note: { type: 'string', title: 'Note shown on the pin', maxLength: 160 },
    },
    required: ['lat', 'lng', 'name'],
    'x-warning': 'Location can be faked; use it for small rewards.',
  },
  signals: [],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    const lat = r.num('lat', { min: -90, max: 90 });
    const lng = r.num('lng', { min: -180, max: 180 });
    const radiusM = r.int('radiusM', { min: 50, max: 2000, required: false, def: 150 });
    const name = r.str('name', { max: 80, required: true });
    const nameHi = r.str('nameHi', { max: 80 });
    const note = r.str('note', { max: 160 });
    return { config: { lat, lng, radiusM, name, nameHi, note }, errors, refs: [] };
  },
  /**
   * docs/EVENTS.md section 11.2. report `{ lat, lng, accuracyM, mocked?, at? }`; ctx `{ config, now, prev }` where `prev` is
   * `{ lat, lng, atMs }` (the devotee's last stored point in this event, server time) or null. The checks run in the contract's
   * order; a refusal comes back as `refuse: { status, code, extra }` (the engine throws it), `invalid` means 400 bad_report. `point`
   * is set for every report that passed the first three checks - the engine stores it whatever the outcome after that.
   */
  evaluate(_state, report, ctx) {
    const rep = report ?? {};
    if (rep.mocked === true) return refuse(422, 'mock_location');
    const { lat, lng, accuracyM } = rep;
    if (!finite(lat) || !finite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return invalid();
    if (rep.at !== undefined && rep.at !== null && Number.isNaN(Date.parse(rep.at))) return invalid();
    if (accuracyM !== undefined && accuracyM !== null && (!finite(accuracyM) || accuracyM < 0)) return invalid();
    if (!finite(accuracyM) || accuracyM > MAX_ACCURACY_M) return refuse(422, 'weak_fix', { accuracyM: finite(accuracyM) ? accuracyM : null, maxM: MAX_ACCURACY_M });
    const point = { lat, lng };

    const now = ctx.now instanceof Date ? ctx.now.getTime() : Number(ctx.now ?? Date.now());
    if (rep.at !== undefined && rep.at !== null) {
      const atMs = Date.parse(rep.at);
      if (now - atMs > MAX_STALE_MS || atMs - now > MAX_FUTURE_MS) return refuse(409, 'implausible_move', {}, point);
    }
    const prev = ctx.prev;
    if (prev) {
      const gapS = (now - prev.atMs) / 1000;
      if (gapS >= MIN_GAP_S && (haversineM([prev.lat, prev.lng], [lat, lng]) / gapS) * 3.6 > MAX_SPEED_KMH) return refuse(409, 'implausible_move', {}, point);
    }

    const { lat: tLat, lng: tLng, radiusM } = ctx.config;
    const distance = haversineM([lat, lng], [tLat, tLng]);
    if (distance > radiusM) return refuse(422, 'too_far', { distanceM: round(distance / 10) * 10, radiusM }, point);
    const name = ctx.config.name;
    return { state: {}, done: true, how: bilingual(`Reached ${name}`, `${ctx.config.nameHi || name} पहुँचे`), point };
  },
  publicState: () => ({}),
  summary: (c, lang) => pick(lang, `Reached ${c.name}`, `${c.nameHi || c.name} पहुँचे`),
};
