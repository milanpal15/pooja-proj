import { requireAuth } from '../middleware/require-auth.js';
import * as astrologers from './astrologers/index.js';
import * as bookings from './bookings/index.js';
import * as calls from './calls/index.js';
import * as chadhava from './chadhava/index.js';
import * as coins from './coins/index.js';
import * as home from './home/index.js';
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
const MODULES = { wallet, coins, home, poojas, bookings, chadhava, astrologers, calls, payouts };

const built = Object.fromEntries(
  Object.entries(MODULES).map(([name, m]) => [name, m.routers({ requireAuth })]),
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
    try {
      m.start?.();
    } catch (e) {
      console.error(`✗ starting jobs for module "${name}" failed:`, e.message);
    }
  }
}
