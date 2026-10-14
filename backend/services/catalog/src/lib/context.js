/**
 * The few things the catalog code needs from outside its own database, injected once by `createApp` (so tests pass fakes
 * and no module reads the environment):
 *   - `config`      the frozen config from config.js
 *   - `settings`    engagement's key/value table (lib/engagement.js)
 *   - `orders`      booking counts / rating aggregates from the orders side (lib/orders-stats.js) - optional, degrades to absent
 *   - `fetchImpl`   fetch for the YouTube/HLS probe (tests inject)
 */
export const ctx = {
  config: null,
  settings: null,
  orders: null,
};

export function setContext(next) {
  Object.assign(ctx, next);
}
