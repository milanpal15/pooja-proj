/**
 * Tell an astrologer a call is ringing. Best effort by design: it NEVER throws, is never awaited by the caller, and the astrologer's app also
 * polls `/astrologer/me/incoming`, so a missing token, an identity / engagement outage or a push outage must never fail or delay the
 * devotee's request. Two independent paths, each swallowing its own failures:
 *   1. FCM (the real one): identity's `push/send` delivers to every phone the astrologer registered - works with the app in the background or
 *      closed. A 30 s TTL (a call that rang 30 s ago is already missed) and a collapse tag so a second ring replaces the first.
 *   2. Expo (legacy, unchanged): device id (identity) -> Expo push token (engagement) -> Expo. Harmless when no Expo token exists.
 */
export function createPush(config, { identity, settings, fetchImpl, logger } = {}) {
  const doFetch = fetchImpl ?? ((...a) => fetch(...a));

  async function send(astrologerUid, devoteeFirstName) {
    const deviceId = await identity.deviceIdOf(astrologerUid);
    if (!deviceId) return;
    const pushToken = await settings.pushToken(deviceId);
    if (!pushToken?.startsWith?.('ExponentPushToken')) return;
    await doFetch(config.expoPushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: 'Incoming call',
        body: devoteeFirstName ? `${devoteeFirstName} is calling` : 'A devotee is calling',
        data: { type: 'incoming_call' },
        priority: 'high',
      }),
      signal: AbortSignal.timeout(5000),
    });
  }

  const incoming = (devoteeFirstName, callId) => ({
    title: 'Incoming call',
    body: devoteeFirstName ? `${devoteeFirstName} is calling` : 'A devotee is calling',
    data: { type: 'incoming_call', ...(callId ? { callId: String(callId) } : {}) },
    channelId: 'incoming-calls',
    ttlSeconds: 30,
    tag: 'incoming_call',
  });

  return {
    notifyIncomingCall(astrologerUid, devoteeFirstName, callId) {
      try {
        // identity.sendPush never rejects; the catch is for a stand-in that does.
        Promise.resolve(identity.sendPush?.(astrologerUid, incoming(devoteeFirstName, callId))).catch((e) => logger?.warn(`incoming-call FCM push to ${astrologerUid} not sent (${e?.code || e?.message})`));
      } catch (e) {
        logger?.warn(`incoming-call FCM push to ${astrologerUid} not sent (${e?.message})`);
      }
      try {
        send(astrologerUid, devoteeFirstName).catch((e) => logger?.warn(`incoming-call push to ${astrologerUid} not sent (${e?.code || e?.message})`));
      } catch (e) {
        logger?.warn(`incoming-call push to ${astrologerUid} not sent (${e?.message})`);
      }
    },
    _send: send,
  };
}
