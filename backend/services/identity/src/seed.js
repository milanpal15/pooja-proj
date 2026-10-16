

import { DEFAULT_BLOCK_MESSAGE, DEFAULT_BLOCK_MESSAGE_HI } from '@bhakti/common';

import { hashPassword } from './lib/passwords.js';
import { Operator, Policy, Role, User } from './models/index.js';

const DEFAULT_TERMS = `## Rules & Regulations

Welcome to **Bhakti**. By continuing you agree to the following.

### 1. Devotional conduct
- Treat the app, its imagery and its rituals with the same respect you would
  show inside a temple.
- Do not misuse deity artwork, aarti audio or temple names outside the app.

### 2. Offerings and bookings
- An **e-Chadhava** offering is a donation to the named temple.
- A **pooja booking** is a request for a priest to perform a seva on your
  behalf on the date you choose. Timings follow the temple's own schedule and
  may shift with festival days.
- Your name and *gotra* are recited during the sankalp exactly as you enter
  them. Please check them before paying.

### 3. Payments and refunds
- Payments are processed by our payment partner. We never store your card or
  UPI credentials.
- A booking may be cancelled up to **24 hours** before the scheduled date for
  a full refund. Offerings, once made, cannot be refunded.

### 4. Your information
- We store your name, contact and booking history to deliver the services you
  ask for.
- We never sell your information.

### 5. Availability
- Live darshan streams depend on each temple's connectivity and may be
  interrupted.
- Booking is arranged temple by temple and may not be available everywhere.

_Questions? Reach us from **Profile → Help & Support**._
`;

/**
 * Make sure somebody can sign in: on an EMPTY operator collection create one admin from ADMIN_USERNAME / ADMIN_PASSWORD
 * (so an upgrade from the shared-password version is not a lockout). Returns what happened so the caller decides:
 * 'exists' | 'created' | 'none' (no operators and no password - the dashboard is unprotected in dev, and in
 * production the caller must refuse to run, because an admin API anyone can use is not a degraded mode worth running).
 */
export async function ensureFirstOperator(config) {
  if ((await Operator.countDocuments()) > 0) return 'exists';
  if (!config.adminPassword) return 'none';
  await Operator.create({ username: config.adminUsername, passwordHash: hashPassword(config.adminPassword), role: 'admin' });
  return 'created';
}

/** Idempotent; set-on-insert only, so an operator's edit is never overwritten. */
export async function seedIdentity(config) {
  await Policy.updateOne(
    { key: 'terms' },
    { $setOnInsert: { key: 'terms', title: 'Rules & Regulations', bodyMd: DEFAULT_TERMS, version: 1, publishedAt: new Date() } },
    { upsert: true },
  );
  await migrateOperatorRoles();
  await migrateUserBlocks();
  return ensureFirstOperator(config);
}

/**
 * In-place upgrade of existing databases (docs/ROLES.md): `Operator.role` used to be a three-value enum, now it is a role KEY. Existing rows already
 * hold `admin` / `editor` / `viewer` - valid keys, so nothing needs rewriting; this only repairs the two shapes the enum used to hide:
 *   - a row with NO role (the schema defaulted it to `editor` on read) is made explicit;
 *   - a key with stray case / spaces is normalised, so it can match a role key.
 * Idempotent. Custom roles live in their own collection (created lazily); a role key that no longer resolves is left alone and holds no rights.
 */
export async function migrateOperatorRoles() {
  await Operator.updateMany({ $or: [{ role: { $exists: false } }, { role: null }, { role: '' }] }, { $set: { role: 'editor' } });
  const odd = await Operator.find({ role: { $regex: /[^a-z0-9-]/ } }).select('role').lean();
  for (const o of odd) await Operator.updateOne({ _id: o._id }, { $set: { role: String(o.role).trim().toLowerCase() } });
  await Role.init();
}


const LEGACY_REASON = 'Blocked before block reasons were recorded';

/**
 * In-place upgrade of existing databases (docs/USERS.md section 1). Idempotent; never touches a row it has already upgraded.
 *   1. A user with the old bare `blocked: true` and no `block` gets a real one (stock message, no end date) and a history row, so it explains itself.
 *   2. The lower-cased `nameLower` / `emailLower` the list's prefix search runs on are filled in for rows that predate them.
 * Done with native pipeline updates (one round trip each), not row by row: the collection may be large.
 */
export async function migrateUserBlocks() {
  const at = { $ifNull: ['$updatedAt', '$$NOW'] };
  await User.collection.updateMany({ blocked: true, block: null }, [
    {
      $set: {
        block: { active: true, scope: 'account', reason: LEGACY_REASON, message: DEFAULT_BLOCK_MESSAGE, messageHi: DEFAULT_BLOCK_MESSAGE_HI, until: null, at, by: 'migration' },
        blockHistory: {
          $concatArrays: [
            { $ifNull: ['$blockHistory', []] },
            [{ action: 'block', at, by: 'migration', reason: LEGACY_REASON, message: DEFAULT_BLOCK_MESSAGE, until: null }],
          ],
        },
      },
    },
  ]);
  await User.collection.updateMany({ nameLower: { $exists: false } }, [
    {
      $set: {
        nameLower: { $toLower: { $trim: { input: { $convert: { input: '$name', to: 'string', onError: '', onNull: '' } } } } },
        emailLower: {
          $cond: [{ $gt: [{ $strLenCP: { $convert: { input: '$email', to: 'string', onError: '', onNull: '' } } }, 0] }, { $toLower: '$email' }, '$$REMOVE'],
        },
      },
    },
  ]);
}
