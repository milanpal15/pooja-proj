import { Visitor } from '../models.js';
import { deviceIdOf } from './user-directory.js';
import { engagementEnabled, getPushToken } from './engagement-client.js';

/**
 * Tell one devotee something happened (a booking moved on). Best effort by
 * design: it never throws and is never awaited by the caller, so a missing
 * token or an Expo outage cannot fail the operator's request. The device's
 * Expo token is the one the app registered via POST /push/register.
 */
export function notifyDevotee(uid, { title, body, data = {} }) {
  (async () => {
    const deviceId = await deviceIdOf(uid);
    if (!deviceId) return;
    const pushToken = engagementEnabled()
      ? await getPushToken(deviceId)
      : (await Visitor.findOne({ deviceId, pushToken: { $ne: null } }).select('pushToken').lean())?.pushToken;
    if (!pushToken?.startsWith?.('ExponentPushToken')) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, data }),
      signal: AbortSignal.timeout(5000),
    });
  })().catch(() => {});
}
