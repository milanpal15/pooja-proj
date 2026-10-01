import { existsSync, readFileSync } from 'fs';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Firebase Admin, used for one job: verifying the ID tokens the app sends.
 *
 * Credentials are looked up in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT       — the service-account JSON, inline
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH  — a path to that JSON file
 *   3. GOOGLE_APPLICATION_CREDENTIALS — the SDK's own default (path)
 *
 * If none is present the server still boots — the dashboard, flags, content
 * and analytics all work without Firebase — but every authenticated route
 * answers 503 instead of quietly trusting whoever calls it. Failing loudly on
 * a missing key is the point: a silent fallback here would mean unverified
 * tokens are accepted in production.
 */

function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline?.trim()) return cert(JSON.parse(inline));

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) return cert(JSON.parse(readFileSync(path, 'utf8')));

  return null;
}

let adminAuth = null;
let initError = null;
let projectId = null;

try {
  const credential = loadCredential();
  if (credential) {
    const app = getApps()[0] ?? initializeApp({ credential });
    adminAuth = getAuth(app);
    projectId = app.options.credential?.projectId ?? null;
    console.log(`✓ Firebase Admin ready — verifying ID tokens for project "${projectId}"`);
  } else {
    initError = 'no service-account credentials configured';
  }
} catch (e) {
  initError = e.message;
}

if (!adminAuth) {
  console.warn(
    `⚠ Firebase Admin not configured (${initError}).\n` +
      '  Authenticated routes (/api/auth/*) will answer 503.\n' +
      '  Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH in .env — see .env.example.',
  );
}

export const firebaseReady = () => adminAuth !== null;
export const firebaseError = () => initError;
/** Which Firebase project this server's key belongs to. */
export const firebaseProjectId = () => projectId;

/**
 * Verify an ID token minted by the app. Throws if invalid or expired.
 *
 * Deliberately NOT `checkRevoked: true`. That flag costs a round-trip to
 * Google's servers on every single authenticated request, and the only thing
 * it buys here is noticing a revoked session — which `requireAuth` already
 * catches for free, by reading `blocked` off the user row it loads anyway.
 * Signature and expiry are checked locally against cached public certs.
 */
export function verifyIdToken(token) {
  if (!adminAuth) throw new Error('Firebase Admin is not configured');
  return adminAuth.verifyIdToken(token);
}

/** Revoke every refresh token for a uid — used when an admin blocks a user. */
export async function revokeUser(uid) {
  if (!adminAuth || !uid) return;
  await adminAuth.revokeRefreshTokens(uid).catch(() => {});
}

/** Delete the Firebase account behind a uid — used when an admin deletes a user. */
export async function deleteFirebaseUser(uid) {
  if (!adminAuth || !uid) return;
  await adminAuth.deleteUser(uid).catch(() => {});
}
