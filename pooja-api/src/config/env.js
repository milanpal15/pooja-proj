import crypto from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Every `process.env` the SERVER reads, in one place (DESIGN.md §14.3).
 *
 * `.env` is loaded by the entry (`src/server.js` imports `dotenv/config`
 * first), so by the time this module is evaluated the file is already in
 * `process.env`. This module deliberately does NOT import dotenv itself: a
 * test or script that imports a single module must not suddenly start
 * picking up the developer's `.env`.
 *
 * Two kinds of value live here:
 *   - plain properties, read once at import — what the old code did with a
 *     module-level `const X = process.env.X`;
 *   - getters, read at the moment of use — what the old code did inside a
 *     function (`ensureFirstOperator`, the health handler). They stay lazy so
 *     behaviour does not change for anything that sets env after import.
 *
 * The payment and call providers' settings are here too, as getters: they must be read at
 * the moment of use (their tests change the environment between calls), so they are not
 * frozen at import. `scripts/*` are standalone CLIs with their own `BASE` knobs and stay out.
 */

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;

export const config = Object.freeze({
  port: env.PORT || 4000,
  mongodbUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pooja_admin',
  isProduction: env.NODE_ENV === 'production',

  /** The dashboard origin(s), comma-separated; '*' reflects any origin. */
  corsOrigin: env.CORS_ORIGIN || '*',

  /**
   * Signing key for the session cookie.
   *
   * Set ADMIN_SESSION_SECRET in any real deployment. Without one a random key
   * is generated per boot, which is safe but signs everyone out on restart.
   */
  sessionSecret: env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  /** How the session cookie travels — see the long note in `modules/operators/session.js`. */
  sessionSameSite: env.SESSION_SAMESITE || 'Strict',

  /**
   * Where media written before the move to GridFS still lives.
   *
   * Nothing is written here any more — see `modules/media/files.js`. It is
   * kept only so a local checkout keeps serving what it already has, and so
   * the migration does not have to happen in the same breath as the deploy.
   */
  uploadDir: env.UPLOAD_DIR || join(here, '..', '..', 'uploads'),
  /**
   * Uploads are buffered in memory, not spooled to disk, because the next
   * stop is the database rather than the filesystem. That makes the size
   * limit a memory limit too, hence something a deploy can lower.
   */
  maxUploadMb: Number(env.MAX_UPLOAD_MB) || 25,

  firebase: {
    /** The service-account JSON, inline. */
    get serviceAccount() { return env.FIREBASE_SERVICE_ACCOUNT; },
    /** A path to that JSON file, or the SDK's own default. */
    get serviceAccountPath() {
      return env.FIREBASE_SERVICE_ACCOUNT_PATH || env.GOOGLE_APPLICATION_CREDENTIALS;
    },
  },

  /** Razorpay. Trimmed: a stray space or newline pasted into a host's dashboard breaks auth invisibly. */
  razorpay: {
    get keyId() { return (env.RAZORPAY_KEY_ID || '').trim(); },
    get keySecret() { return (env.RAZORPAY_KEY_SECRET || '').trim(); },
    get webhookSecret() { return (env.RAZORPAY_WEBHOOK_SECRET || '').trim(); },
  },
  /** What `modules/coins/providers.js` decides the live payment provider from. */
  get paymentsEnv() {
    return {
      NODE_ENV: env.NODE_ENV,
      PAYMENTS_PROVIDER: env.PAYMENTS_PROVIDER,
      RAZORPAY_KEY_ID: this.razorpay.keyId,
      RAZORPAY_KEY_SECRET: this.razorpay.keySecret,
    };
  },
  /** What `modules/calls/rtc.provider.js` decides the audio provider from. */
  get rtcEnv() {
    return {
      NODE_ENV: env.NODE_ENV,
      RTC_PROVIDER: env.RTC_PROVIDER,
      AGORA_APP_ID: (env.AGORA_APP_ID || '').trim(),
      AGORA_APP_CERTIFICATE: (env.AGORA_APP_CERTIFICATE || '').trim(),
    };
  },
  /** Optional: lets the Live Darshan probe verify YouTube streams and read viewer counts. */
  get youtubeApiKey() { return (env.YOUTUBE_API_KEY || '').trim(); },

  /**
   * Phase 1 of the microservices migration (docs/MICROSERVICES.md). UNSET = the monolith owns flags, settings,
   * announcements and analytics in its own collections, exactly as before. SET = those live in the engagement
   * service at this URL: the monolith reads settings/announcement through `lib/engagement-client.js` and stops
   * serving the migrated routes. Rollback is unsetting this variable.
   */
  get engagementUrl() { return (env.ENGAGEMENT_URL || '').trim().replace(/\/+$/, ''); },
  /**
   * Phase 2 (identity). UNSET = the monolith owns users, operators, policies and the audit log and verifies Firebase
   * ID tokens / the operator cookie itself, exactly as before. SET = those live in the identity service: the BFFs
   * authenticate and the monolith TRUSTS their signed service JWT (mobile-bff for devotee routes, admin-bff for
   * operator routes), and reads user facts through `lib/identity-client.js`. Rollback is unsetting this variable.
   */
  get identityUrl() { return (env.IDENTITY_URL || '').trim().replace(/\/+$/, ''); },
  /**
   * Phase 3 (catalog). UNSET = the monolith owns content, Home, live darshan, pooja/chadhava definitions, panchang,
   * horoscope and media in its own collections, exactly as before. SET = those live in the catalog service at this URL:
   * the monolith stops serving and seeding them (404), prices every booking / chadhava order from the catalog's
   * authoritative snapshot (lib/catalog-client.js - fails CLOSED for a purchase), and answers the catalog's
   * `GET /internal/orders/pooja-stats`. Rollback is unsetting this variable.
   */
  get catalogUrl() { return (env.CATALOG_URL || '').trim().replace(/\/+$/, ''); },
  /**
   * Phase 4 (wallet). UNSET = the monolith owns wallets, the coin ledger, coin packs and purchases in its own collections and talks to
   * Razorpay itself, exactly as before. SET = those live in the wallet service at this URL: the monolith moves coins ONLY through
   * `lib/wallet-client.js` (fail CLOSED - a wallet that cannot be reached is 503 `wallet_unavailable`, never success - and every call
   * carries the same idempotency key as ever), stops serving and seeding the wallet/coins routes (404), and no longer reads
   * PAYMENTS_PROVIDER / RAZORPAY_* (the wallet service does). Needs ENGAGEMENT_URL: the billing rules it writes live there.
   * Rollback is unsetting this variable.
   */
  get walletUrl() { return (env.WALLET_URL || '').trim().replace(/\/+$/, ''); },
  /**
   * Phase 5 (orders). UNSET = the monolith owns pooja bookings, chadhava orders and pooja reviews in its own collections (and the money saga
   * around them: `lib/wallet-saga.js`), exactly as before, and answers the catalog's `GET /internal/orders/pooja-stats`. SET = those live in the
   * orders service at this URL: the monolith answers 404 for `/api/bookings*`, `/api/chadhava/orders*`, `POST /api/chadhava` (the 410),
   * `/api/poojas/:slug/reviews` and `/api/admin/bookings|reviews|chadhava-orders`, stops serving the pooja-stats route, and its saga sweeper leaves
   * booking / chadhava intents alone (the orders service owns them). Needs CATALOG_URL, WALLET_URL, IDENTITY_URL and ENGAGEMENT_URL as well: the
   * orders service prices from catalog, moves coins through the wallet and is reached only through BFFs that authenticate. Rollback is unsetting this variable.
   */
  get ordersUrl() { return (env.ORDERS_URL || '').trim().replace(/\/+$/, ''); },
  /**
   * Phase 6 (calls). UNSET = the monolith owns astrologers, calls and payouts in its own collections (and the billing ticker, silence detection and the
   * audio provider: RTC_PROVIDER / AGORA_*), exactly as before, and answers identity's `/internal/astrologers/claim|active`. SET = those live in the
   * calls service at this URL: the monolith answers 404 for `/api/astrologers*`, `/api/astrologer/me/*`, `/api/calls*` and `/api/admin/astrologers|calls|
   * payouts`, retires the internal claim endpoints, stops seeding and stops its billing ticker (the calls service runs it). Needs WALLET_URL, IDENTITY_URL
   * and ENGAGEMENT_URL as well: the calls service spends through the wallet, writes roles to identity and reads its rules from engagement.
   * Rollback is unsetting this variable.
   */
  get callsUrl() { return (env.CALLS_URL || '').trim().replace(/\/+$/, ''); },
  /** HS256 secret shared with the services and BFFs (>= 16 chars): signs calls to engagement, verifies /internal/audit. */
  get internalJwtSecret() { return (env.INTERNAL_JWT_SECRET || '').trim(); },

  // Read when the first operator is bootstrapped / when /api/health answers.
  get adminPassword() { return env.ADMIN_PASSWORD || ''; },
  get adminUsername() { return (env.ADMIN_USERNAME || 'admin').toLowerCase(); },
  get commit() { return env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null; },
});
