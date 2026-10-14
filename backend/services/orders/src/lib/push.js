import { createServiceClient } from '@bhakti/common';

/**
 * Tell one devotee something happened (a booking moved on). Best effort by design: it NEVER throws, is never awaited by the caller, and a
 * missing token / identity down / engagement down / a push outage costs the notification and nothing else - the operator's status change has
 * already been saved. Two independent paths, each swallowing its own failures:
 *   1. FCM (reaches phones with the app closed): identity's `push/send` delivers to every phone the devotee registered, on the `default` channel.
 *   2. Expo (legacy, unchanged): device id (identity) -> Expo push token (engagement) -> Expo.
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

  const identityPush = createServiceClient({
    service: 'identity',
    baseUrl: config.identityUrl,
    iss: 'orders',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  /** FCM through identity. `data` is stringified there; the title / body are what the OS shows with the app closed. */
  async function sendFcm(uid, { title, body, data = {} }) {
    return identityPush.post('/internal/identity/push/send', { uid, title, body, data, channelId: 'default' });
  }

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
      try {
        sendFcm(uid, message).catch((e) => logger?.warn(`FCM push to ${uid} not sent (${e?.code || e?.message})`));
      } catch (e) {
        logger?.warn(`FCM push to ${uid} not sent (${e?.message})`);
      }
      send(uid, message).catch((e) => logger?.warn(`push to ${uid} not sent (${e?.code || e?.message})`));
    },
    _send: send,
    _sendFcm: sendFcm,
  };
}
