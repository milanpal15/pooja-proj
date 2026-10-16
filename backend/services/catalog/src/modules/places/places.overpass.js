import { SNAP_MARGIN_M } from './places.geo.js';

export const ATTRIBUTION = '© OpenStreetMap contributors';
const MAX_NAME = 200;

/** Overpass QL: every Hindu place of worship (node, way, relation) around the point; ways/relations come back with a `center`. */
export function buildQuery({ lat, lng, radius }, timeoutSec = 20) {
  const around = `around:${Math.round(radius + SNAP_MARGIN_M)},${lat.toFixed(5)},${lng.toFixed(5)}`;
  const f = `["amenity"="place_of_worship"]["religion"="hindu"](${around})`;
  return `[out:json][timeout:${timeoutSec}];\n(node${f};way${f};relation${f};);\nout center tags;`;
}

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '');
const DEVANAGARI = /[ऀ-ॿ]/;

function address(t) {
  const full = clean(t['addr:full']);
  if (full) return full;
  const street = [clean(t['addr:housenumber']), clean(t['addr:street'])].filter(Boolean).join(' ');
  const parts = [
    clean(t['addr:housename']),
    street,
    clean(t['addr:suburb']) || clean(t['addr:neighbourhood']) || clean(t['addr:quarter']),
    clean(t['addr:city']) || clean(t['addr:town']) || clean(t['addr:village']) || clean(t['addr:hamlet']) || clean(t['addr:district']),
  ].filter(Boolean);
  if (!parts.length) parts.push(clean(t['is_in:city']) || clean(t.is_in));
  const seen = new Set();
  const out = parts.filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
  return out.length ? out.join(', ').slice(0, 300) : null;
}

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function deity(t) {
  let raw = clean(t.deity) || clean(t['deity:en']);
  if (!raw) {
    const k = Object.keys(t).find((x) => x.startsWith('deity:') && !/^deity:(wikidata|wikipedia)/.test(x) && clean(t[x]));
    raw = k ? clean(t[k]) : '';
  }
  if (!raw) raw = clean(t.denomination); // shaivism / vaishnavism ... ("religion" is always hindu here, so it says nothing)
  if (!raw || raw.toLowerCase() === 'hindu') return null;
  return raw.split(/[;,]/).map((s) => title(s.trim().replace(/_/g, ' '))).filter(Boolean).join(', ').slice(0, 120) || null;
}

/**
 * Overpass `elements` -> [{ id, name, nameHi, lat, lng, address, deity }]. Tolerant: an element that is malformed, unnamed or has no
 * usable coordinates is skipped, never an error. Duplicates (same id) collapse.
 */
export function normalise(elements) {
  const out = [];
  const seen = new Set();
  for (const el of Array.isArray(elements) ? elements : []) {
    if (!el || typeof el !== 'object' || !['node', 'way', 'relation'].includes(el.type) || !Number.isFinite(Number(el.id))) continue;
    const t = el.tags && typeof el.tags === 'object' ? el.tags : null;
    if (!t) continue;
    const lat = Number(el.type === 'node' ? el.lat : el.center?.lat);
    const lng = Number(el.type === 'node' ? el.lon : el.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const name = clean(t.name) || clean(t['name:hi']) || clean(t['name:en']);
    if (!name) continue;
    const id = `osm:${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hi = clean(t['name:hi']) || (DEVANAGARI.test(name) ? name : '');
    out.push({ id, name, nameHi: hi || null, lat, lng, address: address(t), deity: deity(t) });
  }
  return out;
}

/** Not an answer worth caching: Overpass reports a timed-out/out-of-memory run with HTTP 200 plus a `remark`. */
export const isPartial = (body) => typeof body?.remark === 'string' && /runtime error|out of memory|timed out/i.test(body.remark);
