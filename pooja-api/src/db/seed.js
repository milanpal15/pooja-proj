import { catalogEnabled } from '../lib/catalog-client.js';
import { identityEnabled } from '../lib/identity-client.js';
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
  await seedContent(); // with CATALOG_URL set it seeds only the settings (the catalog service seeds the rest)
  if (!catalogEnabled()) await backfillBookingFlag();
  if (!identityEnabled()) await seedPolicies(); // identity seeds the default policy
}
