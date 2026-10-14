import { config } from '../config/env.js';
import { signServiceToken } from './service-jwt.js';

/**
 * The monolith's window onto the engagement service (settings, announcement, push tokens) - phase 1 of
 * docs/MICROSERVICES.md. Only used when ENGAGEMENT_URL is set; with it unset nothing here is called and
 * the monolith reads its own collections.
 *
 * Design rules:
 *   - A READ NEVER THROWS into a request. Timeout 5 s; the last good answer (any age) is served when
 *     engagement is down, else the documented defaults below.
 *   - 15 s in-memory TTL cache for settings and the announcement (they are read on every booking / content
 *     fetch). So a dashboard edit reaches the monolith within 15 s.
 *   - After a failure the next 5 s of reads skip the network entirely, so an outage costs one 5 s timeout,
 *     not one per request.
 *   - WRITES (billing rules) do surface failure: an operator must know the save did not happen.
 */

export const TTL_MS = 15_000;
export const RETRY_AFTER_FAIL_MS = 5_000;
export const TIMEOUT_MS = 5_000;

/** What `GET /api/content` serves for `settings` while engagement is unreachable and nothing is cached yet. */
export const FALLBACK_SETTINGS = Object.freeze({
  prasadDelivery: '99',
  supportEmail: '',
  supportPhone: '',
  supportHours: '',
  supportHoursHi: '',
});

export const engagementEnabled = () => Boolean(config.engagementUrl);

const state = new Map(); // name -> { value, at, failedAt, inflight }
let fetchImpl = (...a) => fetch(...a);
let warnedAt = 0;

/** Test hooks. */
export const _reset = () => state.clear();
export const _setFetch = (f) => { fetchImpl = f ?? ((...a) => fetch(...a)); };

function warn(msg) {
  if (Date.now() - warnedAt > 30_000) {
    warnedAt = Date.now();
    console.warn(`! engagement unreachable (${msg}) - serving cached/default values`);
  }
}

/** One signed call. Throws on any non-2xx or network failure. */
export async function call(method, path, { body, as, timeoutMs = TIMEOUT_MS } = {}) {
  const token = signServiceToken({ iss: 'monolith', ...(as || {}) }, { secret: config.internalJwtSecret });
  const res = await fetchImpl(`${config.engagementUrl}/internal/engagement${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || `engagement ${res.status}`), { status: res.status, body: data });
  return data;
}

/** Cached GET with stale-on-error. `pick` maps the response to the cached value; `fallback` is the last resort. */
async function cachedRead(name, path, pick, fallback) {
  const s = state.get(name) ?? {};
  state.set(name, s);
  const now = Date.now();
  if (s.value !== undefined && now - s.at < TTL_MS) return s.value;
  if (s.failedAt && now - s.failedAt < RETRY_AFTER_FAIL_MS) return s.value ?? fallback;
  s.inflight ??= call('GET', path)
    .then((data) => {
      s.value = pick(data);
      s.at = Date.now();
      s.failedAt = 0;
    })
    .catch((e) => {
      s.failedAt = Date.now();
      warn(e.message);
    })
    .finally(() => {
      s.inflight = null;
    });
  await s.inflight;
  return s.value ?? fallback;
}

/** { key: value } for every setting. */
export const getSettingsMap = () =>
  cachedRead('settings', '/settings/map', (d) => (d && typeof d.settings === 'object' && d.settings) || {}, { ...FALLBACK_SETTINGS });

/** The newest live announcement as `/api/content` embeds it, or null. */
export const getCurrentAnnouncement = () =>
  cachedRead('announcement', '/announcements/current', (d) => d?.announcement ?? null, null);

/** One device's Expo push token, or null. Never throws, never cached (it is read once per notification). */
export async function getPushToken(deviceId) {
  try {
    return (await call('GET', `/visitors/${encodeURIComponent(deviceId)}/push-token`))?.pushToken ?? null;
  } catch {
    return null;
  }
}

/** Write settings (billing rules). Throws if engagement refuses or is down; the cache is dropped on success. */
export async function upsertSettings(items, as) {
  const out = await call('POST', '/settings/upsert', { body: { items }, as });
  state.delete('settings');
  return out;
}
