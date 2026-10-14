import { createServiceClient } from '@bhakti/common';

export const TTL_MS = 15_000;
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

  return {
    getUser,
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
    _reset: () => { users.clear(); failedAt = 0; },
  };
}
