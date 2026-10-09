import { seedPolicies } from '../modules/policies/index.js';
import { backfillBookingFlag, seedContent } from '../modules/content/content.seed.js';
import { seedFlags } from '../modules/flags/flags.seed.js';

/**
 * The defaults a fresh database needs, each owned by its module and each
 * idempotent. The ORDER is the one `connectDb` has always used — flags,
 * content, the booking backfill, policies — and it runs before the first
 * operator is bootstrapped and before `seedModules()`.
 */
export async function seedDefaults() {
  await seedFlags();
  await seedContent();
  await backfillBookingFlag();
  await seedPolicies();
}
