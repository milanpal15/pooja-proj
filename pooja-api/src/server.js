/**
 * The backend, as its own service (boot only — `app.js` builds the app).
 *
 * It used to live inside `pooja-admin/`, which made the phone app's API a
 * subfolder of the admin tool: the app could not be served without the
 * dashboard also running, and locking the dashboard down meant locking the
 * app out. They are separate concerns on one database, and now separate
 * processes — the app talks to this, the dashboard talks to this, and
 * neither depends on the other being up.
 *
 * This serves BOTH surfaces, gated: the app's endpoints are the allowlist
 * in `middleware/access.js`, everything else wants an operator session.
 */
import 'dotenv/config';

import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDb } from './db/connect.js';
import { seedDefaults } from './db/seed.js';
import { markReady } from './lib/readiness.js';
import { identityEnabled } from './lib/identity-client.js';
import { engagementEnabled } from './lib/engagement-client.js';
import { catalogEnabled } from './lib/catalog-client.js';
import { callsEnabled } from './lib/calls-guard.js';
import { ordersEnabled } from './lib/orders-guard.js';
import { walletEnabled } from './lib/wallet-client.js';
import { ensureFirstOperator } from './modules/operators/index.js';
import { seedModules, startModuleJobs } from './modules/index.js';

// WALLET_URL set: the billing rules the wallet service writes live in engagement, and this process reads them from there. Without it
// the two would disagree about the coin rate, the call minimum and the refund cut-off - on a money path, so refuse to start.
if (walletEnabled() && !engagementEnabled()) {
  console.error('✗ WALLET_URL is set but ENGAGEMENT_URL is not: the wallet service keeps the billing rules in engagement. Set both, or neither.');
  process.exit(1);
}
if (walletEnabled() && config.internalJwtSecret.length < 16) {
  console.error('✗ WALLET_URL is set but INTERNAL_JWT_SECRET is missing or shorter than 16 characters.');
  process.exit(1);
}

// ORDERS_URL set (phase 5): bookings, chadhava orders and reviews are the orders service's, which prices from catalog, spends through the wallet,
// and is reached only through BFFs that authenticate the caller. The monolith stops serving them, so a half-configured stack would silently lose them.
if (ordersEnabled()) {
  const missing = [['CATALOG_URL', catalogEnabled()], ['WALLET_URL', walletEnabled()], ['IDENTITY_URL', identityEnabled()], ['ENGAGEMENT_URL', engagementEnabled()]].filter(([, on]) => !on).map(([n]) => n);
  if (missing.length) {
    console.error(`✗ ORDERS_URL is set but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not: the orders service needs all of them. Set them all, or unset ORDERS_URL.`);
    process.exit(1);
  }
  if (config.internalJwtSecret.length < 16) {
    console.error('✗ ORDERS_URL is set but INTERNAL_JWT_SECRET is missing or shorter than 16 characters.');
    process.exit(1);
  }
}

// CALLS_URL set (phase 6): astrologers, calls and payouts are the calls service's, which spends through the wallet, writes roles to identity and reads
// its billing rules from engagement, and is reached only through BFFs that authenticate. The monolith stops serving them, so a half-configured stack
// would silently lose them (and the astrologer claim identity asks at sign-in).
if (callsEnabled()) {
  const missing = [['WALLET_URL', walletEnabled()], ['IDENTITY_URL', identityEnabled()], ['ENGAGEMENT_URL', engagementEnabled()]].filter(([, on]) => !on).map(([n]) => n);
  if (missing.length) {
    console.error(`✗ CALLS_URL is set but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not: the calls service needs all of them. Set them all, or unset CALLS_URL.`);
    process.exit(1);
  }
  if (config.internalJwtSecret.length < 16) {
    console.error('✗ CALLS_URL is set but INTERNAL_JWT_SECRET is missing or shorter than 16 characters.');
    process.exit(1);
  }
}

const app = createApp();

/*
 * Nothing should reach these — `asyncRouter` and the handler above catch
 * what routes throw — but a rejection from a timer or a stray listener
 * would still end the process, and an API that dies on one bad request is
 * worse than one that logs and keeps serving.
 */
process.on('unhandledRejection', (reason) => {
  console.error('✗ Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught exception:', err?.stack || err);
});

/** Run one startup step with timing, and give up on it (not on the server) after `ms`. */
async function step(name, fn, ms = 90_000) {
  const t = Date.now();
  let timer;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`still running after ${ms / 1000}s, moving on`)), ms);
      }),
    ]);
    console.log(`✓ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    console.error(`✗ ${name} failed after ${Date.now() - t} ms:`, e?.message || e);
  } finally {
    clearTimeout(timer);
  }
}

/*
 * Bind the port as soon as the database is connected, THEN seed. Seeding used to come first, and on
 * a hosted database every seed query is a network round trip: Render saw no open port, concluded
 * the service had not started ("Port scan timeout") and killed it. Every seed is idempotent and
 * none is needed to answer a request, and until `markReady()` the health check says 503 and the
 * admin gate fails closed (an empty operator table is a 503 in production, never an open door).
 */
connectDb(config.mongodbUri, { seed: false })
  .then(() => {
    app.listen(config.port, () => console.log(`✓ API on http://localhost:${config.port}`));
    return startUp();
  })
  .catch((err) => {
    console.error('✗ Failed to start — is MongoDB running?', err.message);
    process.exit(1);
  });

async function startUp() {
  await step('seeded defaults', seedDefaults);
  // Operators live in the database, so the first one can only be created once connected.
  // (It exits the process itself in production when there is no way to sign in.)
  // With IDENTITY_URL set the identity service owns operators (and creates the first admin itself).
  if (!identityEnabled()) await step('first operator checked', ensureFirstOperator);
  await step('modules seeded', seedModules);
  startModuleJobs();
  markReady();
  console.log('✓ Startup finished');
}
