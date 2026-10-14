import { catalogEnabled } from '../lib/catalog-client.js';
import { callsEnabled, unlessCalls } from '../lib/calls-guard.js';
import { unlessCatalog } from '../lib/catalog-guard.js';
import { unlessOrders } from '../lib/orders-guard.js';
import { unlessWallet } from '../lib/wallet-guard.js';
import { walletEnabled } from '../lib/wallet-client.js';
import { requireAuth } from '../middleware/require-auth.js';
import * as astrologers from './astrologers/index.js';
import * as bookings from './bookings/index.js';
import * as calls from './calls/index.js';
import * as chadhava from './chadhava/index.js';
import * as coins from './coins/index.js';
import * as home from './home/index.js';
import * as live from './live/index.js';
import * as payouts from './payouts/index.js';
import * as poojas from './poojas/index.js';
import * as wallet from './wallet/index.js';

/**
 * Feature modules (DESIGN.md §12–§14), mounted in two places on purpose.
 *
 *   mountOpenModules(app)   BEFORE the admin gate — the routers the phone app
 *                           uses. `public` has no auth (explicit, read-only);
 *                           `devotee` routes verify a Firebase token themselves
 *                           via the injected `requireAuth`.
 *   mountAdminModules(app)  AFTER the gate — dashboard routes, which therefore
 *                           need an operator session. Each path belongs to an area
 *                           (access/routes.js) and each role holds some areas'
 *                           permissions (access/permissions.js); an unmapped path is admin-only.
 *
 * A module that exports nothing mounts nothing, so a half-built one is inert.
 */
const MODULES = { wallet, coins, home, live, poojas, bookings, chadhava, astrologers, calls, payouts };

/** Phase 3: modules the catalog service owns outright (home, live). `poojas` and `chadhava` keep their order/review routes. */
const CATALOG_OWNED = new Set(['home', 'live']);

/** Phase 4: modules the wallet service owns outright (wallet, coins - including the Razorpay webhook and the billing rules). */
const WALLET_OWNED = new Set(['wallet', 'coins']);

/** Phase 5: the module the orders service owns outright (bookings). `chadhava` and `poojas` keep their catalog parts and guard their order / review routes themselves. */
const ORDERS_OWNED = new Set(['bookings']);

/** Phase 6: the modules the calls service owns outright (astrologers, calls, payouts - including the sign-in claim, the billing ticker and the audio provider). */
const CALLS_OWNED = new Set(['astrologers', 'calls', 'payouts']);

const built = Object.fromEntries(
  Object.entries(MODULES).map(([name, m]) => {
    const r = m.routers({ requireAuth });
    if (CATALOG_OWNED.has(name)) for (const k of ['public', 'devotee', 'admin']) if (r[k]) r[k] = unlessCatalog(r[k]);
    if (WALLET_OWNED.has(name)) for (const k of ['public', 'devotee', 'admin']) if (r[k]) r[k] = unlessWallet(r[k]);
    if (ORDERS_OWNED.has(name)) for (const k of ['public', 'devotee', 'admin']) if (r[k]) r[k] = unlessOrders(r[k]);
    if (CALLS_OWNED.has(name)) for (const k of ['public', 'devotee', 'admin']) if (r[k]) r[k] = unlessCalls(r[k]);
    return [name, r];
  }),
);

export function mountOpenModules(app) {
  for (const r of Object.values(built)) {
    if (r.public) app.use('/api', r.public);
    if (r.devotee) app.use('/api', r.devotee);
  }
}

export function mountAdminModules(app) {
  for (const r of Object.values(built)) if (r.admin) app.use('/api', r.admin);
}

/** Run every module's idempotent seed once the database is connected. */
export async function seedModules() {
  for (const [name, m] of Object.entries(MODULES)) {
    if (!m.seed) continue;
    if (catalogEnabled() && ['home', 'live', 'poojas'].includes(name)) continue; // the catalog service seeds these
    if (walletEnabled() && WALLET_OWNED.has(name)) continue; // the wallet service seeds its packs; engagement seeds the settings and flags
    if (callsEnabled() && CALLS_OWNED.has(name)) continue; // the calls service owns its collections (the billing rules it used to seed live in engagement)
    const t = Date.now();
    try {
      await m.seed();
      console.log(`✓ seeded ${name} (${Date.now() - t} ms)`);
    } catch (e) {
      console.error(`✗ seeding module "${name}" failed after ${Date.now() - t} ms:`, e.message);
    }
  }
}

/** Background jobs (billing ticker, reconcilers). Each module may export `start()`. */
export function startModuleJobs() {
  for (const [name, m] of Object.entries(MODULES)) {
    if (catalogEnabled() && name === 'live') continue; // the catalog service runs the live-stream probe
    try {
      m.start?.();
    } catch (e) {
      console.error(`✗ starting jobs for module "${name}" failed:`, e.message);
    }
  }
}
