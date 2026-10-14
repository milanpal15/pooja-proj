import { callsEnabled } from '../../lib/calls-guard.js';
import { ordersEnabled } from '../../lib/orders-guard.js';
import { ensureSetting } from '../../lib/settings.js';
import { walletEnabled } from '../../lib/wallet-client.js';
import * as wallet from '../../lib/wallet-ledger.js';
import { callRouters } from './call.routes.js';
import { startTicker } from './billing.ticker.js';

export { CallSession } from './call.model.js';
import { dropStaleDevoteeLiveIndex } from './call.model.js';
export * as callService from './call.service.js';
export { tick } from './billing.ticker.js';

export const routers = (deps) => callRouters(deps);

/** Billing rules, seeded only when absent so an operator's edit survives every boot. */
export async function seed() {
  // Migration, idempotent: the old unique index made it impossible for two devotees to be on a call at once.
  await dropStaleDevoteeLiveIndex().catch((e) => console.error('✗ could not drop the stale devoteeLive_1 index:', e.message));
  await ensureSetting('minMinutes', 3, 'Minimum minutes to start a call', 'A devotee needs coins for this many minutes before a call can begin.');
  await ensureSetting('ringTimeoutSec', 25, 'Ring timeout (seconds)', 'How long an astrologer has to answer before the call counts as missed.');
  await ensureSetting('defaultSharePct', 30, 'Default platform share (%)', 'Platform share pre-filled for a newly added astrologer.');
  await ensureSetting('payoutPaisePerCoin', 100, 'Payout per coin (paise)', 'Rupee value, in paise, of one coin an astrologer earns.');
  await ensureSetting('callsEnabled', 'true', 'Astrologer calls enabled', 'Kill switch: false refuses every new call.');
}

let sweeper = null;

/**
 * The money saga's sweeper alone, for a monolith whose calls have moved to the calls service (CALLS_URL) but whose bookings / chadhava orders have not
 * (ORDERS_URL unset): their intents still live here and the billing ticker - which used to run the sweep - is no longer started.
 */
function startSagaSweeper(everyMs = 5000) {
  if (sweeper) return;
  let running = false;
  sweeper = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await wallet.reconcilePending();
    } catch (e) {
      console.error('✗ saga sweep failed:', e.message);
    } finally {
      running = false;
    }
  }, everyMs);
  sweeper.unref?.();
}

export function start() {
  if (callsEnabled()) {
    // The calls service runs the billing ticker, the silence rule and the call-refund sweeper. What stays here, if anything, is the order sagas'.
    if (walletEnabled() && !ordersEnabled()) startSagaSweeper();
    return;
  }
  startTicker();
}
