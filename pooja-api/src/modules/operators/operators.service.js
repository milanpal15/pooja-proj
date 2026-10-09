import { config } from '../../config/env.js';
import { Operator } from './operator.model.js';
import { hashPassword } from './passwords.js';

const IS_PROD = config.isProduction;

/**
 * Make sure somebody can sign in.
 *
 * On an empty operator collection, create one admin from ADMIN_USERNAME /
 * ADMIN_PASSWORD. That keeps the existing env contract working and means an
 * upgrade from the shared-password version is not a lockout.
 *
 * Production refuses to start without a password for the same reason it did
 * before: an admin API anyone can use is not a degraded mode worth running.
 */
export async function ensureFirstOperator() {
  const password = config.adminPassword;
  const username = config.adminUsername;

  const count = await Operator.countDocuments();
  if (count > 0) return;

  if (!password) {
    if (IS_PROD) {
      console.error(
        '✗ No operators exist and ADMIN_PASSWORD is not set.\n' +
          '  Refusing to start: there would be no way to sign in, and the\n' +
          '  dashboard would be open to anyone. Set ADMIN_PASSWORD.',
      );
      process.exit(1);
    }
    console.warn(
      '⚠ No operators and no ADMIN_PASSWORD — the dashboard is UNPROTECTED.\n' +
        '  Fine on localhost. Production refuses to start like this.',
    );
    return;
  }

  await Operator.create({ username, passwordHash: hashPassword(password), role: 'admin' });
  console.log(`✓ Created the first operator "${username}" (admin) from ADMIN_PASSWORD`);
}

/** True once at least one operator exists — i.e. sign-in is required. */
export async function authRequired() {
  return (await Operator.countDocuments({ active: true })) > 0;
}
