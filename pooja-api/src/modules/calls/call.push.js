import { User, Visitor } from '../../models.js';

/**
 * Tell an astrologer a call is ringing. Best effort by design: the astrologer's
 * app also polls `/astrologer/me/incoming`, so a missing token, an Expo outage
 * or a slow network must never fail or delay the devotee's request.
 */
export function notifyIncomingCall(astrologerUid, devoteeFirstName) {
  (async () => {
    const user = await User.findOne({ uid: astrologerUid }).select('deviceId').lean();
    if (!user?.deviceId) return;
    const v = await Visitor.findOne({ deviceId: user.deviceId, pushToken: { $ne: null } }).select('pushToken').lean();
    if (!v?.pushToken?.startsWith?.('ExponentPushToken')) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: v.pushToken,
        title: 'Incoming call',
        body: devoteeFirstName ? `${devoteeFirstName} is calling` : 'A devotee is calling',
        data: { type: 'incoming_call' },
        priority: 'high',
      }),
      signal: AbortSignal.timeout(5000),
    });
  })().catch(() => {});
}
