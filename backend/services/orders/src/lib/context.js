/**
 * The few things the orders code needs from outside its own database, injected once by `createApp` (so tests pass fakes and no module
 * reads the environment):
 *   - `config`    the frozen config from config.js
 *   - `log`       the service logger
 *   - `wallet`    the money client (lib/wallet.js) - FAIL CLOSED, the same idempotency keys as ever
 *   - `catalog`   the priced snapshot a purchase is made from (lib/catalog.js) - never cached for a purchase
 *   - `identity`  the devotee directory (lib/identity.js) - names and push device ids, display only
 *   - `push`      best-effort notifications (lib/push.js)
 *   - `redact`    the devotee-PII masking for roles without `devotees:view` (lib/redact.js)
 */
export const ctx = {
  config: null,
  log: { info() {}, warn() {}, error() {} },
  wallet: null,
  catalog: null,
  identity: null,
  push: null,
  redact: null,
};

export function setContext(next) {
  Object.assign(ctx, next);
}
