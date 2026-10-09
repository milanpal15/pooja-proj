import { User, Visitor } from '../models.js';

/**
 * Tell one devotee something happened (a booking moved on). Best effort by
 * design: it never throws and is never awaited by the caller, so a missing
 * token or an Expo outage cannot fail the operator's request. The device's
 * Expo token is the one the app registered via POST /push/register.
 */
export function notifyDevotee(uid, { title, body, data = {} }) {
  (async () => {
    const user = await User.findOne({ uid }).select('deviceId').lean();
    if (!user?.deviceId) return;
    const v = await Visitor.findOne({ deviceId: user.deviceId, pushToken: { $ne: null } }).select('pushToken').lean();
    if (!v?.pushToken?.startsWith?.('ExponentPushToken')) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: v.pushToken, title, body, data }),
      signal: AbortSignal.timeout(5000),
    });
  })().catch(() => {});
}
