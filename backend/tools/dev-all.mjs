#!/usr/bin/env node
/**
 * One command for the local stack (phase 6):
 *   events (4090) is the Events service (catalog lookups; coin rewards via the wallet, names via identity; USE_EVENTS=0 skips it; its database `events`: EVENTS_MONGODB_URI else MONGODB_URI minus its path).
 *   engagement (4030) + identity (4040) + catalog (4050) + wallet (4060) + orders (4070) + calls (4080)  <-  monolith (../pooja-api, PORT 4100)  <-  mobile-bff (4010) and admin-bff (4020)
 *   (the BFFs call engagement and identity directly; the monolith reads settings/announcements/user facts through them and
 *   TRUSTS the BFFs' signed tokens - mobile-bff verifies Firebase ID tokens, admin-bff owns the operator session cookie)
 * Env is passed through (MONGODB_URI etc. come from pooja-api/.env as usual). Engagement uses ITS OWN database
 * `engagement` on the same server: MONGODB_URI minus its path, or ENGAGEMENT_MONGODB_URI. INTERNAL_JWT_SECRET is
 * taken from the environment, else a random one is made for this run.
 * Override with MONOLITH_PORT, MOBILE_BFF_PORT, ADMIN_BFF_PORT, ENGAGEMENT_PORT.
 * USE_ENGAGEMENT=0 runs without the engagement service (the monolith keeps flags/settings/announcements/analytics).
 * USE_CATALOG=0 runs without the catalog service (the monolith keeps content, Home, live, poojas/chadhava definitions, media ...).
 *   The catalog needs the engagement service (settings) and, on the mobile BFF, identity (live darshan's Jai): USE_CATALOG=1 with either
 *   of those off is refused. It uses ITS OWN database `catalog` (CATALOG_MONGODB_URI, else MONGODB_URI minus its path), holds the GridFS media.
 * USE_WALLET=0 runs without the wallet service (the monolith keeps wallets, the coin ledger, coin packs and talks to Razorpay itself).
 *   The wallet needs the engagement service (the billing rules) and the identity service (names behind the wallet search; the mobile BFF
 *   authenticates the devotee routes): USE_WALLET=1 with either off is refused. It uses ITS OWN database `wallet` (WALLET_MONGODB_URI, else
 *   MONGODB_URI minus its path). PAYMENTS_PROVIDER / RAZORPAY_* belong to the wallet service now: put them in services/wallet/.env or the shell
 *   (unset = the mock provider, which the wallet refuses when NODE_ENV=production). The webhook URL on Razorpay stays the mobile BFF's.
 * USE_ORDERS=0 runs without the orders service (the monolith keeps pooja bookings, chadhava orders, reviews and the money saga around them).
 *   Orders needs engagement (push tokens), identity (names, devices; the mobile BFF authenticates the devotee), catalog (prices) and wallet (coins): USE_ORDERS=1
 *   with any of those off is refused. It uses ITS OWN database `orders` (ORDERS_MONGODB_URI, else MONGODB_URI minus its path). Existing data: run
 *   `npm run split-db -- --source <monolith db uri> --service orders` first (copies bookings, chadhava orders, reviews and the unfinished saga intents).
 * USE_CALLS=0 runs without the calls service (the monolith keeps astrologers, calls, payouts, the billing ticker and the audio provider; identity asks the monolith for the invite claim).
 *   Calls needs engagement (the billing rules), identity (names, roles; the mobile BFF authenticates the devotee) and the wallet (coins): USE_CALLS=1 with any of those off is refused. It uses ITS OWN
 *   database `calls` (CALLS_MONGODB_URI, else MONGODB_URI minus its path). RTC_PROVIDER / AGORA_* belong to the calls service now: put them in services/calls/.env or the shell (unset = the mock
 *   provider, which the service refuses when NODE_ENV=production). Existing data: run `npm run split-db -- --source <monolith db uri> --service calls` first, with no call live.
 * USE_IDENTITY=0 runs without the identity service (the monolith keeps users/operators/policies and authenticates itself).
 * Identity uses ITS OWN database `identity` (IDENTITY_MONGODB_URI, else MONGODB_URI minus its path); its first admin comes
 * from ADMIN_USERNAME / ADMIN_PASSWORD in the environment or services/identity/.env. Firebase: the service-account file is
 * taken from FIREBASE_SERVICE_ACCOUNT_PATH, else ../pooja-api/firebase-service-account.json when it exists.
 * ADMIN_SESSION_SECRET (cookie signing in admin-bff, devotee pseudonyms in the monolith) is taken from the environment, else
 * random for this run.
 * Existing data: run `npm run split-db -- --source <MONGODB_URI>` once first (see README), or the engagement
 * database starts from the seeded defaults. Ctrl-C stops everything.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const ports = {
  monolith: Number(env.MONOLITH_PORT) || 4100,
  mobile: Number(env.MOBILE_BFF_PORT) || 4010,
  admin: Number(env.ADMIN_BFF_PORT) || 4020,
  engagement: Number(env.ENGAGEMENT_PORT) || 4030,
  identity: Number(env.IDENTITY_PORT) || 4040,
  catalog: Number(env.CATALOG_PORT) || 4050,
  wallet: Number(env.WALLET_PORT) || 4060,
  orders: Number(env.ORDERS_PORT) || 4070,
  calls: Number(env.CALLS_PORT) || 4080,
  events: Number(env.EVENTS_PORT) || 4090,
};
const useEngagement = env.USE_ENGAGEMENT !== '0';
const useIdentity = env.USE_IDENTITY !== '0';
const useCatalog = env.USE_CATALOG !== '0';
const useWallet = env.USE_WALLET !== '0';
const useOrders = env.USE_ORDERS !== '0';
const useCalls = env.USE_CALLS !== '0';
const useEvents = env.USE_EVENTS !== '0';
if (useCatalog && !(useEngagement && useIdentity)) {
  console.error('The catalog service needs the engagement service (settings) and the identity service (the mobile BFF authenticates live-darshan Jai): run with USE_CATALOG=0, or drop USE_ENGAGEMENT=0 / USE_IDENTITY=0.');
  process.exit(1);
}
if (useWallet && !(useEngagement && useIdentity)) {
  console.error('The wallet service needs the engagement service (the billing rules) and the identity service (the mobile BFF authenticates the devotee wallet routes): run with USE_WALLET=0, or drop USE_ENGAGEMENT=0 / USE_IDENTITY=0.');
  process.exit(1);
}
if (useOrders && !(useEngagement && useIdentity && useCatalog && useWallet)) {
  console.error('The orders service needs the engagement service (push tokens), the identity service (names; the mobile BFF authenticates the devotee), the catalog (prices) and the wallet (coins): run with USE_ORDERS=0, or drop USE_ENGAGEMENT=0 / USE_IDENTITY=0 / USE_CATALOG=0 / USE_WALLET=0.');
  process.exit(1);
}
if (useCalls && !(useEngagement && useIdentity && useWallet)) {
  console.error('The calls service needs the engagement service (the billing rules), the identity service (names, roles; the mobile BFF authenticates the devotee) and the wallet (coins): run with USE_CALLS=0, or drop USE_ENGAGEMENT=0 / USE_IDENTITY=0 / USE_WALLET=0.');
  process.exit(1);
}
if (useEvents && !useCatalog) {
  console.error('The events service checks the streams / listings / poojas an event refers to in the catalog: run with USE_EVENTS=0, or drop USE_CATALOG=0.');
  process.exit(1);
}
const monolithUrl = `http://127.0.0.1:${ports.monolith}`;
const engagementUrl = `http://127.0.0.1:${ports.engagement}`;
const identityUrl = `http://127.0.0.1:${ports.identity}`;
const catalogUrl = `http://127.0.0.1:${ports.catalog}`;
const walletUrl = `http://127.0.0.1:${ports.wallet}`;
const ordersUrl = `http://127.0.0.1:${ports.orders}`;
const callsUrl = `http://127.0.0.1:${ports.calls}`;
const eventsUrl = `http://127.0.0.1:${ports.events}`;
const secret = env.INTERNAL_JWT_SECRET && env.INTERNAL_JWT_SECRET.length >= 16 ? env.INTERNAL_JWT_SECRET : randomBytes(24).toString('hex');
const sessionSecret = env.ADMIN_SESSION_SECRET && env.ADMIN_SESSION_SECRET.length >= 16 ? env.ADMIN_SESSION_SECRET : randomBytes(24).toString('hex');
const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT_PATH || (existsSync(join(root, '..', 'pooja-api', 'firebase-service-account.json')) ? join(root, '..', 'pooja-api', 'firebase-service-account.json') : '');
const firebaseEnv = serviceAccount ? { FIREBASE_SERVICE_ACCOUNT_PATH: serviceAccount } : {};
const engagementEnv = {
  ...(useEngagement ? { ENGAGEMENT_URL: engagementUrl } : {}),
  ...(useIdentity ? { IDENTITY_URL: identityUrl, ADMIN_SESSION_SECRET: sessionSecret } : {}),
  ...(useCatalog ? { CATALOG_URL: catalogUrl } : {}),
  ...(useWallet ? { WALLET_URL: walletUrl } : {}),
  ...(useOrders ? { ORDERS_URL: ordersUrl } : {}),
  ...(useCalls ? { CALLS_URL: callsUrl } : {}),
  ...(useEvents ? { EVENTS_URL: eventsUrl } : {}),
  ...(useEngagement || useIdentity || useCatalog || useWallet || useOrders || useCalls || useEvents ? { INTERNAL_JWT_SECRET: secret } : {}),
};
/** The server part of MONGODB_URI (engagement picks its own database name). */
const mongoBaseOf = (uri) => uri.replace(/^([^/]+\/\/[^/?]+)[^?]*(\?.*)?$/, '$1$2');
const identityMongoBase = mongoBaseOf(env.IDENTITY_MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
const walletMongoBase = mongoBaseOf(env.WALLET_MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
const ordersMongoBase = mongoBaseOf(env.ORDERS_MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
const eventsMongoBase = mongoBaseOf(env.EVENTS_MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
const callsMongoBase = mongoBaseOf(env.CALLS_MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
const catalogMongoBase = mongoBaseOf(env.CATALOG_MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
const mongoBase = (env.ENGAGEMENT_MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017').replace(/^([^/]+\/\/[^/?]+)[^?]*(\?.*)?$/, '$1$2');
const children = [];
let stopping = false;

function run(label, cwd, script, extraEnv) {
  const child = spawn(process.execPath, [script], { cwd, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `[${label}]`.padEnd(12);
  for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) out.write(`${tag}${l}\n`);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${tag}exited (${code}); stopping the rest`);
      stop(1);
    }
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

async function waitHealthy(url, tries = 120) {
  for (let i = 0; i < tries && !stopping; i++) {
    try {
      if ((await fetch(url)).status === 200) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (useEngagement) {
  run('engagement', join(root, 'services', 'engagement'), 'src/server.js', {
    PORT: String(ports.engagement),
    MONGODB_URI: mongoBase,
    INTERNAL_JWT_SECRET: secret,
    ...(useIdentity ? { IDENTITY_URL: identityUrl } : {}), // the approver count for risky version changes
  });
}
if (useIdentity) {
  run('identity', join(root, 'services', 'identity'), 'src/server.js', {
    PORT: String(ports.identity),
    MONGODB_URI: identityMongoBase,
    INTERNAL_JWT_SECRET: secret,
    MONOLITH_URL: monolithUrl,
    ...(useCalls ? { CALLS_URL: callsUrl } : {}),
    ...firebaseEnv,
  });
}
if (useCatalog) {
  run('catalog', join(root, 'services', 'catalog'), 'src/server.js', {
    PORT: String(ports.catalog),
    MONGODB_URI: catalogMongoBase,
    INTERNAL_JWT_SECRET: secret,
    ENGAGEMENT_URL: engagementUrl,
    ORDERS_URL: useOrders ? ordersUrl : monolithUrl, // booking counts / rating aggregates: the orders service, else the monolith
  });
}
if (useWallet) {
  run('wallet', join(root, 'services', 'wallet'), 'src/server.js', {
    PORT: String(ports.wallet),
    MONGODB_URI: walletMongoBase,
    INTERNAL_JWT_SECRET: secret,
    ENGAGEMENT_URL: engagementUrl,
    IDENTITY_URL: identityUrl,
    ADMIN_SESSION_SECRET: sessionSecret,
  });
}
if (useOrders) {
  run('orders', join(root, 'services', 'orders'), 'src/server.js', {
    PORT: String(ports.orders),
    MONGODB_URI: ordersMongoBase,
    INTERNAL_JWT_SECRET: secret,
    WALLET_URL: walletUrl,
    CATALOG_URL: catalogUrl,
    IDENTITY_URL: identityUrl,
    ENGAGEMENT_URL: engagementUrl,
    ADMIN_SESSION_SECRET: sessionSecret,
  });
}
if (useCalls) {
  run('calls', join(root, 'services', 'calls'), 'src/server.js', {
    PORT: String(ports.calls),
    MONGODB_URI: callsMongoBase,
    INTERNAL_JWT_SECRET: secret,
    WALLET_URL: walletUrl,
    IDENTITY_URL: identityUrl,
    ENGAGEMENT_URL: engagementUrl,
    ADMIN_SESSION_SECRET: sessionSecret,
  });
}
if (useEvents) {
  run('events', join(root, 'services', 'events'), 'src/server.js', {
    PORT: String(ports.events),
    MONGODB_URI: eventsMongoBase,
    INTERNAL_JWT_SECRET: secret,
    CATALOG_URL: catalogUrl,
    // Rewards are credited through the wallet and names come from identity; without them events still runs (coins wait, pseudonyms show).
    ...(useWallet ? { WALLET_URL: walletUrl } : {}),
    ...(useIdentity ? { IDENTITY_URL: identityUrl } : {}),
    ADMIN_SESSION_SECRET: sessionSecret,
  });
}
run('monolith', join(root, '..', 'pooja-api'), 'src/index.js', { PORT: String(ports.monolith), ...engagementEnv });
for (const [name, dir] of [['mobile', 'mobile'], ['admin', 'admin']]) {
  run(`${name}-bff`, join(root, 'bff', dir), 'src/server.js', { PORT: String(ports[name]), MONOLITH_URL: monolithUrl, ...engagementEnv, ...(name === 'mobile' ? firebaseEnv : {}) });
}

const ok = await waitHealthy(`${monolithUrl}/api/health`);
console.log(ok ? '\nStack is up:' : '\nMonolith did not become healthy in 60 s (is MongoDB reachable?). BFFs report 503 until it does.');
for (const [label, url] of [
  ...(useEngagement ? [['engagement ', engagementUrl]] : []),
  ...(useIdentity ? [['identity   ', identityUrl]] : []),
  ...(useCatalog ? [['catalog    ', catalogUrl]] : []),
  ...(useWallet ? [['wallet     ', walletUrl]] : []),
  ...(useOrders ? [['orders     ', ordersUrl]] : []),
  ...(useCalls ? [['calls      ', callsUrl]] : []),
  ...(useEvents ? [['events     ', eventsUrl]] : []),
  ['monolith   ', monolithUrl],
  ['mobile-bff ', `http://127.0.0.1:${ports.mobile}`],
  ['admin-bff  ', `http://127.0.0.1:${ports.admin}`],
]) {
  let status = 'down';
  const path = label.startsWith('engagement') || label.startsWith('identity') || label.startsWith('catalog') || label.startsWith('wallet') || label.startsWith('orders') || label.startsWith('calls') || label.startsWith('events') ? '/health' : '/api/health';
  try { status = (await fetch(`${url}${path}`)).status; } catch { /* down */ }
  console.log(`  ${label} ${url}   ${path} -> ${status}`);
}
console.log('\nCtrl-C to stop.\n');
