

import { hashPassword } from './lib/passwords.js';
import { Operator, Policy } from './models/index.js';

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
  return ensureFirstOperator(config);
}

