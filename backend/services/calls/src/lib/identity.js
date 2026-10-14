import { createServiceClient } from '@bhakti/common';

export const TTL_MS = 15_000;
/** How long "does this uid have a push-registered phone?" is remembered. */
export const REACHABLE_TTL_MS = 60_000;
const REACHABLE_TIMEOUT_MS = 1_500;
const RETRY_AFTER_FAIL_MS = 5_000;

/**
 * The calls service's window onto the identity service (the devotee directory). Display only - nothing here decides money:
 *
 *   userName(uid, hint)  the devotee's name on a call. The name the signed token already carried (`hint`) is preferred (no call at all);
 *                        otherwise the directory; otherwise ''.
 *   deviceIdOf(uid)      the device id a push token is looked up by.
 *   setRole(uid, role)   BEST EFFORT write of the convenience role (`devotee` | `astrologer`) on the user, as the monolith's setUserRole was:
 *                        a failure is logged and never fails the astrologer lifecycle (the role is re-derived at the next sign-in, and every
 *                        astrologer route re-checks the astrologer row itself).
 *
 *   pushReachable(uid)   true | false | undefined: does this uid have a phone registered for push (identity's registry). Cached 60 s per uid.
 *                        UNDEFINED when identity cannot answer - the caller keeps whatever it had, it never flips on a failure.
 *   sendPush(uid, msg)   best-effort `push/send` through identity (which holds the Firebase key); resolves `{sent, devices}`, NEVER rejects.
 *
 * Every read is non-critical: 15 s cache with stale-on-error, and identity down means "absent" (the uid is shown, no push is sent), never an
 * error in a request. After a failure the next 5 s of reads skip the network.
 */
export function createIdentityDirectory(config, { fetchImpl, logger, now = () => Date.now() } = {}) {
  const client = createServiceClient({
    service: 'identity',
    baseUrl: config.identityUrl,
    iss: 'calls',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const users = new Map(); // uid -> { value, at }
  let failedAt = 0;
  let warnedAt = 0;
  const failed = (e) => {
    failedAt = now();
    if (now() - warnedAt > 30_000) {
      warnedAt = now();
      logger?.warn(`identity unreachable (${e?.code || e?.message}): serving cached / absent user facts`);
    }
  };
  const skip = () => failedAt && now() - failedAt < RETRY_AFTER_FAIL_MS;

  /** { name, contact, deviceId, role } or null (unknown uid, or identity down and nothing cached). */
  async function getUser(uid) {
    if (!uid) return null;
    const hit = users.get(uid);
    if (hit && now() - hit.at < TTL_MS) return hit.value;
    if (skip()) return hit?.value ?? null;
    try {
      const data = await client.get(`/internal/identity/directory/users/${encodeURIComponent(uid)}`);
      const value = data?.user ?? null;
      users.set(uid, { value, at: now() });
      if (users.size > 2000) users.delete(users.keys().next().value);
      failedAt = 0;
      return value;
    } catch (e) {
      if (e?.status === 404) { users.set(uid, { value: null, at: now() }); return null; }
      failed(e);
      return hit?.value ?? null;
    }
  }

  const reachables = new Map(); // uid -> { value, at }

  return {
    getUser,
    async pushReachable(uid) {
      if (!uid) return undefined;
      const hit = reachables.get(uid);
      if (hit && now() - hit.at < REACHABLE_TTL_MS) return hit.value;
      try {
        const out = await client.get('/internal/identity/push/reachable', { query: { uid }, timeoutMs: REACHABLE_TIMEOUT_MS });
        if (typeof out?.reachable !== 'boolean') return undefined;
        reachables.set(uid, { value: out.reachable, at: now() });
        if (reachables.size > 2000) reachables.delete(reachables.keys().next().value);
        return out.reachable;
      } catch (e) {
        failed(e);
        return undefined; // keep the previous value: an identity blink must not make an astrologer uncallable
      }
    },
    async sendPush(uid, message) {
      try {
        return await client.post('/internal/identity/push/send', { uid, ...message });
      } catch (e) {
        logger?.warn(`push/send for ${uid} failed (${e?.code || e?.message})`);
        return { sent: 0, devices: 0, error: true };
      }
    },
    async userName(uid, hint) {
      if (typeof hint === 'string' && hint.trim()) return hint;
      return (await getUser(uid))?.name || '';
    },
    async deviceIdOf(uid) {
      return (await getUser(uid))?.deviceId || undefined;
    },
    /** Best-effort role write. Identity down = logged, never thrown. */
    async setRole(uid, role) {
      if (!uid) return;
      try {
        await client.put(`/internal/identity/directory/users/${encodeURIComponent(uid)}/role`, { role });
        users.delete(uid);
      } catch (e) {
        failed(e);
        logger?.error(`could not set the ${role} role for ${uid} in identity: ${e?.code || e?.message} (re-derived at the next sign-in)`);
      }
    },
    client,
    _reset: () => { users.clear(); reachables.clear(); failedAt = 0; },
  };
}
