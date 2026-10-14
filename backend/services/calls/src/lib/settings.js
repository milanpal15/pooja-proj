import { createServiceClient } from '@bhakti/common';

import { HttpError } from './http-error.js';

/**
 * The calls service's window onto the engagement service (the `Setting` table: minMinutes, ringTimeoutSec, defaultSharePct,
 * payoutPaisePerCoin, callsEnabled) and onto a device's push token.
 *
 * The monolith's reader substituted a documented default for "I could not ask". Here the MONEY-affecting rules never do - when engagement cannot
 * answer, the read FAILS (503 `settings_unavailable`) instead of guessing:
 *
 *   FRESH (default)  at most TTL_MS old, else asks; unreachable = throws.   minMinutes (the balance gate on a new call), callsEnabled (the kill
 *                    switch), defaultSharePct (the share an astrologer is created with), payoutPaisePerCoin (what a billed minute EARNS).
 *   lenient          the last answer of ANY age if there is one, else the caller's fallback (the documented default); never throws.
 *                    ringTimeoutSec only: it is a timing rule (how long an astrologer has to answer), it moves no money, and the billing
 *                    clock must keep running when engagement blinks.
 *
 * (A key that is simply absent from a map that WAS read still gets the documented default - that is operator state, not a guess.)
 */
export const TTL_MS = 15_000;

const unavailable = () => new HttpError(503, 'settings_unavailable', 'Settings are unavailable right now. Please try again in a moment.');

export function createSettingsReader(config, { fetchImpl, logger, now = () => Date.now() } = {}) {
  const client = createServiceClient({
    service: 'engagement',
    baseUrl: config.engagementUrl,
    iss: 'calls',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  let value;
  let at = 0;
  let inflight = null;

  async function load() {
    const data = await client.get('/internal/engagement/settings/map');
    value = (data && typeof data.settings === 'object' && data.settings) || {};
    at = now();
  }

  /** The settings map. `lenient: true` never throws (the last map of any age, else {}); the default throws `settings_unavailable`. */
  async function map({ lenient = false } = {}) {
    if (value !== undefined && now() - at < TTL_MS) return value;
    if (lenient && value !== undefined) {
      // Known but stale: refresh in the background, answer now.
      if (!inflight) inflight = load().catch((e) => logger?.warn(`engagement settings unreachable (${e?.code || e?.message}): using the last answer`)).finally(() => { inflight = null; });
      return value;
    }
    inflight ??= load().finally(() => { inflight = null; });
    try {
      await inflight;
    } catch (e) {
      if (lenient) {
        logger?.warn(`engagement settings unreachable (${e?.code || e?.message}): using the documented default`);
        return {};
      }
      logger?.warn(`engagement settings unreachable (${e?.code || e?.message}): refusing rather than guessing`);
      throw unavailable();
    }
    return value;
  }

  const get = async (key, fallback = '', o) => (await map(o))[key] ?? fallback;
  const getNumber = async (key, fallback, o) => {
    const raw = String(await get(key, '', o)).trim();
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : fallback;
  };
  const getBool = async (key, fallback, o) => {
    const v = String(await get(key, '', o)).trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
    return fallback;
  };

  /** One device's Expo push token, or null. Never throws (best effort, once per notification). */
  async function pushToken(deviceId) {
    try {
      return (await client.get(`/internal/engagement/visitors/${encodeURIComponent(deviceId)}/push-token`))?.pushToken ?? null;
    } catch {
      return null;
    }
  }

  return { map, get, getNumber, getBool, pushToken, client, _reset: () => { value = undefined; at = 0; } };
}
