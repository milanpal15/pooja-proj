/**
 * The thin edge to Firebase Cloud Messaging, kept apart so everything above it can be tested with a fake.
 *
 * `send(message)` resolves to `{ ok: true }` or `{ ok: false, dead, unavailable?, error? }`. `dead` means FCM says this token will never
 * work again (app uninstalled, token rotated), so the caller should forget it. It NEVER throws.
 *
 * `messaging` is firebase-admin's Messaging (or a fake with `send(message)`), or a function returning one / null (lazy: lib/firebase.js
 * may have no credentials, in which case every send is `{ ok:false, unavailable:true }` and the service still boots).
 */
const DEAD_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

/**
 * `invalid-argument` is also what FCM answers to a malformed MESSAGE (our bug) - forgetting every phone for that would be a disaster - so it only
 * counts when the error says the token is the problem.
 */
export function isDeadTokenError(e) {
  if (DEAD_CODES.has(e?.code)) return true;
  return e?.code === 'messaging/invalid-argument' && /registration token/i.test(e?.message || '');
}

export function createFcmSender({ messaging } = {}) {
  const get = () => (typeof messaging === 'function' ? messaging() : messaging) ?? null;
  return {
    available: () => !!get(),
    async send(message) {
      const m = get();
      if (!m) return { ok: false, dead: false, unavailable: true };
      try {
        await m.send(message);
        return { ok: true };
      } catch (e) {
        return { ok: false, dead: isDeadTokenError(e), error: e?.code ?? e?.message };
      }
    },
  };
}
