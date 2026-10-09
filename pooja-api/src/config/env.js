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
 * Not here on purpose: `modules/*` (coins' payment providers, the RTC
 * provider) read env at call time and their tests mutate it between calls,
 * and `scripts/*` are standalone CLIs with their own `BASE`/`DAYS` knobs.
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

  // Read when the first operator is bootstrapped / when /api/health answers.
  get adminPassword() { return env.ADMIN_PASSWORD || ''; },
  get adminUsername() { return (env.ADMIN_USERNAME || 'admin').toLowerCase(); },
  get commit() { return env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null; },
});
