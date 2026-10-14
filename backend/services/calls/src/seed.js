import { Astrologer, AstrologerEarning, CallIntent, CallSession, Payout } from './models.js';

/**
 * Deliberately seeds nothing: astrologers are people an operator adds, never demo data, and the billing rules (minMinutes, ringTimeoutSec,
 * defaultSharePct, payoutPaisePerCoin, callsEnabled) are seeded by the engagement service, which owns the settings table. What "seeding" means here
 * is making sure the indexes exist BEFORE traffic - above all the unique ones the rules rest on (one live call per devotee, one connected call per
 * astrologer, a call unique on (devotee, requestId), an earning unique on (call, minute), a sign-in identifier unique per astrologer, an intent on its
 * wallet key). `db.js` already runs `init()` on connect; this waits for it again and is what `/health` gates on, so /health is 200 only once every
 * unique index is really built (a DB split's copied rows are in place before this service starts).
 */
export async function seedCalls({ log = () => {} } = {}) {
  await Promise.all([Astrologer, CallSession, AstrologerEarning, Payout, CallIntent].map((m) => m.init()));
  log('indexes ready');
}
