import { createServiceClient } from '@bhakti/common';

/**
 * Tell one devotee something happened (a booking moved on). Best effort by design, exactly as the monolith's lib/push.js: it NEVER throws,
 * is never awaited by the caller, and a missing token / identity down / engagement down / an Expo outage costs the notification and nothing
 * else - the operator's status change has already been saved. device id (identity) -> Expo push token (engagement) -> Expo.
 */
export function createPush(config, { identity, fetchImpl, logger } = {}) {
  const doFetch = fetchImpl ?? ((...a) => fetch(...a));
  const engagement = createServiceClient({
    service: 'engagement',
    baseUrl: config.engagementUrl,
    iss: 'orders',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  async function send(uid, { title, body, data = {} }) {
    const deviceId = await identity.deviceIdOf(uid);
    if (!deviceId) return;
    const pushToken = (await engagement.get(`/internal/engagement/visitors/${encodeURIComponent(deviceId)}/push-token`))?.pushToken;
    if (!pushToken?.startsWith?.('ExponentPushToken')) return;
    await doFetch(config.expoPushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, data }),
      signal: AbortSignal.timeout(5000),
    });
  }

  return {
    notifyDevotee(uid, message) {
      send(uid, message).catch((e) => logger?.warn(`push to ${uid} not sent (${e?.code || e?.message})`));
    },
    _send: send,
  };
}
