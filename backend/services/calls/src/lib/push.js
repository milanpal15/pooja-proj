/**
 * Tell an astrologer a call is ringing. Best effort by design, exactly as the monolith's call.push.js: it NEVER throws, is never awaited by
 * the caller, and the astrologer's app also polls `/astrologer/me/incoming`, so a missing token, an identity / engagement outage or an Expo
 * outage must never fail or delay the devotee's request. device id (identity) -> Expo push token (engagement) -> Expo.
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

  return {
    notifyIncomingCall(astrologerUid, devoteeFirstName) {
      try {
        send(astrologerUid, devoteeFirstName).catch((e) => logger?.warn(`incoming-call push to ${astrologerUid} not sent (${e?.code || e?.message})`));
      } catch (e) {
        logger?.warn(`incoming-call push to ${astrologerUid} not sent (${e?.message})`);
      }
    },
    _send: send,
  };
}
