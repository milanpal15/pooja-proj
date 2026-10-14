import { PushDevice } from '../models/index.js';

export const MAX_TOKEN = 4096;
/** A phone is rarely more than a handful per person; anything beyond this many is the oldest, long-dead registrations. */
export const MAX_DEVICES_PER_UID = 10;
const MAX_TTL_SECONDS = 2_419_200; // FCM's own ceiling: 4 weeks
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

const cleanToken = (t) => (typeof t === 'string' ? t.trim() : '');

/** Remember a phone for this account. A token registered to someone else moves to this account. */
export async function registerDevice(uid, { token, platform } = {}) {
  const t = cleanToken(token);
  if (!t || t.length > MAX_TOKEN) return { ok: false, code: 'bad_token' };
  const doc = { uid, platform: platform === 'ios' ? 'ios' : 'android', lastSeenAt: new Date() };
  for (let i = 0; ; i++) {
    try {
      await PushDevice.updateOne({ token: t }, { $set: doc }, { upsert: true });
      break;
    } catch (e) {
      if (e?.code !== 11000 || i > 0) throw e; // two registrations of the same token raced the upsert: the second pass updates
    }
  }
  const old = await PushDevice.find({ uid }).sort({ lastSeenAt: -1 }).skip(MAX_DEVICES_PER_UID).select('_id').lean();
  if (old.length) await PushDevice.deleteMany({ _id: { $in: old.map((d) => d._id) } });
  return { ok: true };
}

/** Forget a phone (sign-out). Only the owner can remove it; anyone else's token is a quiet no-op. */
export async function unregisterDevice(uid, token) {
  const t = cleanToken(token);
  if (!t || t.length > MAX_TOKEN) return { ok: false, code: 'bad_token' };
  await PushDevice.deleteOne({ uid, token: t });
  return { ok: true };
}

export const hasDevice = async (uid) => !!(await PushDevice.exists({ uid }));

/** FCM data values must be strings: primitives are stringified, objects / arrays / null are dropped. */
export function stringData(data) {
  const out = {};
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) {
      if (['string', 'number', 'boolean'].includes(typeof v)) out[String(k).slice(0, 64)] = String(v).slice(0, 1024);
    }
  }
  return out;
}

/**
 * Send one notification to every phone this account has registered.
 *
 * Best effort by design: it NEVER throws, so a push problem can never fail the request that triggered it. Dead tokens are removed as FCM
 * reports them.
 *
 *   ttlSeconds   how long FCM may hold the message for an offline phone. A ringing call is worthless after ~30 s, so it is short.
 *   channelId    the Android notification channel; it owns sound and importance (created by the app).
 *   tag          Android collapse key + notification tag: a newer message with the same tag replaces the older one.
 */
export function createPushService({ sender, logger } = {}) {
  async function pushToUid(uid, { title, body, data, channelId, ttlSeconds, tag } = {}) {
    try {
      const devices = await PushDevice.find({ uid }).select('token').lean();
      if (!devices.length) return { sent: 0, devices: 0 };
      const wanted = Math.floor(Number(ttlSeconds));
      const ttl = Math.min(wanted > 0 ? wanted : 60, MAX_TTL_SECONDS);
      const cleanTag = clip(tag, 64);
      const payload = {
        notification: { title: clip(title, 200), body: clip(body, 1000) },
        data: stringData(data),
        android: {
          priority: 'high',
          ttl: ttl * 1000,
          ...(cleanTag ? { collapseKey: cleanTag } : {}),
          notification: { channelId: clip(channelId, 64) || 'default', ...(cleanTag ? { tag: cleanTag } : {}), defaultSound: true, visibility: 'public' },
        },
      };
      const results = await Promise.all(
        devices.map(async ({ token }) => {
          const r = await sender.send({ token, ...payload });
          if (r.dead) await PushDevice.deleteOne({ token }).catch(() => {});
          else if (!r.ok && !r.unavailable) logger?.warn(`push to ${uid} not delivered (${r.error})`);
          return r.ok;
        }),
      );
      return { sent: results.filter(Boolean).length, devices: devices.length };
    } catch (e) {
      logger?.warn(`push to ${uid} failed (${e?.message})`);
      return { sent: 0, devices: 0, error: true };
    }
  }
  return { pushToUid };
}
