/**
 * The few things the calls code needs from outside its own database, injected once by `createApp` (so tests pass fakes and no module
 * reads the environment):
 *   - `config`    the frozen config from config.js
 *   - `log`       the service logger
 *   - `wallet`    the money client (lib/wallet.js) - FAIL CLOSED, the same idempotency keys as ever
 *   - `settings`  the billing rules in engagement (lib/settings.js) - the money-affecting ones fail closed
 *   - `identity`  the devotee directory (lib/identity.js) - names, push device ids, and the role written back to a user
 *   - `push`      best-effort "incoming call" notification (lib/push.js)
 *   - `redact`    the devotee-PII / sign-in-identifier masking for roles without the permission (lib/redact.js)
 *   - `rtc`       resolves the real-time audio provider (lib/rtc.js); tests may swap it
 *   (time is never read from here: `tick(now)` and `acceptCall(call, now)` take it as an argument, so tests drive it directly)
 */
export const ctx = {
  config: null,
  log: { info() {}, warn() {}, error() {} },
  wallet: null,
  settings: null,
  identity: null,
  push: null,
  redact: null,
  rtc: null,
};

export function setContext(next) {
  Object.assign(ctx, next);
}
