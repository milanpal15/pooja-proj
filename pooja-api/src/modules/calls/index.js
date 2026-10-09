import { ensureSetting } from '../../lib/settings.js';
import { callRouters } from './call.routes.js';
import { startTicker } from './billing.ticker.js';

export { CallSession } from './call.model.js';
export * as callService from './call.service.js';
export { tick } from './billing.ticker.js';

export const routers = (deps) => callRouters(deps);

/** Billing rules, seeded only when absent so an operator's edit survives every boot. */
export async function seed() {
  await ensureSetting('minMinutes', 3, 'Minimum minutes to start a call', 'A devotee needs coins for this many minutes before a call can begin.');
  await ensureSetting('ringTimeoutSec', 25, 'Ring timeout (seconds)', 'How long an astrologer has to answer before the call counts as missed.');
  await ensureSetting('defaultSharePct', 30, 'Default platform share (%)', 'Platform share pre-filled for a newly added astrologer.');
  await ensureSetting('payoutPaisePerCoin', 100, 'Payout per coin (paise)', 'Rupee value, in paise, of one coin an astrologer earns.');
  await ensureSetting('callsEnabled', 'true', 'Astrologer calls enabled', 'Kill switch: false refuses every new call.');
}

export function start() {
  startTicker();
}
