import { ctx } from './context.js';

/**
 * Tell a devotee something happened. The caller has ALREADY saved the change, so nothing here may fail the request: a push that throws
 * (synchronously or not) costs the notification and a log line, nothing more. Never awaited.
 */
export function notify(uid, message) {
  try {
    ctx.push.notifyDevotee(uid, message);
  } catch (e) {
    ctx.log.warn(`push to ${uid} not sent (${e?.message})`);
  }
}
