/**
 * The few things the wallet code needs from outside its own database, injected once by `createApp` (so tests pass fakes and no
 * module reads the environment):
 *   - `config`    the frozen config from config.js
 *   - `settings`  engagement's key/value table (lib/engagement.js)
 *   - `identity`  the devotee directory (lib/identity.js)
 *   - `redact`    the devotee-PII masking for roles without `devotees:view` (lib/redact.js)
 *   - `fetchImpl` fetch for Razorpay's order API (tests inject)
 */
export const ctx = {
  config: null,
  settings: null,
  identity: null,
  redact: null,
  fetchImpl: (...a) => fetch(...a),
};

export function setContext(next) {
  Object.assign(ctx, next);
}
