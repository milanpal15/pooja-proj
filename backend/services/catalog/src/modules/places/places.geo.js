import { HttpError } from '../../lib/http-error.js';

export const GRID = 0.05; // degrees
export const BUCKETS = [2000, 5000, 10000, 20000, 25000];
export const DEFAULT_RADIUS = 8000;
export const MIN_RADIUS = 500;
export const MAX_RADIUS = 25000;
/** The centre is snapped to the grid, so the cached circle can sit up to ~3.9 km from the requested point; the upstream query adds this. */
export const SNAP_MARGIN_M = 4000;

const bad = (msg) => new HttpError(400, 'bad_params', msg);

/** A strict number from a query value: a plain decimal string, nothing else (no '', arrays, '1e3', '0x10', 'NaN'). */
function num(v, name) {
  if (typeof v !== 'string' || !/^[+-]?\d{1,10}(\.\d{1,12})?$/.test(v.trim())) throw bad(`${name} must be a number.`);
  return Number(v.trim());
}

/** @returns {{lat:number, lng:number, radius:number}} */
export function parseParams(q = {}) {
  const lat = num(q.lat, 'lat');
  const lng = num(q.lng, 'lng');
  if (lat < -90 || lat > 90) throw bad('lat must be between -90 and 90.');
  if (lng < -180 || lng > 180) throw bad('lng must be between -180 and 180.');
  let radius = DEFAULT_RADIUS;
  if (q.radius !== undefined && q.radius !== '') radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, num(q.radius, 'radius')));
  return { lat, lng, radius: Math.round(radius) };
}

export const snap = (v) => Math.round(Math.round(v / GRID) * GRID * 100) / 100;
export const bucketFor = (radius) => BUCKETS.find((b) => b >= radius) ?? BUCKETS.at(-1);

export function cell(lat, lng, radius) {
  const bucket = bucketFor(radius);
  const sLat = snap(lat);
  const sLng = snap(lng);
  return { key: `${sLat.toFixed(2)}:${sLng.toFixed(2)}:${bucket}`, lat: sLat, lng: sLng, radius: bucket };
}

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
/** Great-circle distance in metres. */
export function haversine(aLat, aLng, bLat, bLng) {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
