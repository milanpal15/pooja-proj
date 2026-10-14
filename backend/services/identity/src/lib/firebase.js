import { existsSync, readFileSync } from 'node:fs';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Firebase Admin, used for push (Firebase Cloud Messaging, see lib/fcm.js) and for two jobs triggered from the dashboard (hence here and not in the BFFs -
 * the internet-facing admin edge never holds a key that can delete accounts):
 *   - revoke a blocked devotee's refresh tokens, so their phone really is signed out;
 *   - delete the Firebase account behind a devotee the dashboard deletes (else the next sign-in would recreate the row).
 * Token VERIFICATION is the mobile BFF's job and needs no secret.
 *
 * Credential lookup: inline JSON > path to the JSON > GOOGLE_APPLICATION_CREDENTIALS. With none configured both
 * operations are no-ops (as they were in the monolith) and /health/deps reports it; the service still boots.
 * Failures of a revoke / delete are logged and swallowed - the row change they accompany has already happened.
 */
export function createFirebase(config, { logger } = {}) {
  let auth = null;
  let messaging = null;
  let initError = null;
  try {
    const inline = config.firebaseServiceAccount?.trim();
    const path = config.firebaseServiceAccountPath || config.googleApplicationCredentials;
    const credential = inline ? cert(JSON.parse(inline)) : path && existsSync(path) ? cert(JSON.parse(readFileSync(path, 'utf8'))) : null;
    if (credential) {
      // A named app, so it never collides with another Firebase user in the same process (tests).
      const app = getApps().find((a) => a.name === 'identity') ?? initializeApp({ credential }, 'identity');
      auth = getAuth(app);
      messaging = getMessaging(app);
      logger?.info(`Firebase Admin ready (project "${app.options.credential?.projectId ?? '?'}")`);
    } else {
      initError = 'no service-account credentials configured';
    }
  } catch (e) {
    initError = e.message;
  }
  if (!auth) logger?.warn(`Firebase Admin not configured (${initError}): blocking will not revoke refresh tokens and deleting a devotee will not delete their Firebase account.`);

  return {
    ready: () => auth !== null,
    error: () => initError,
    /** Firebase Cloud Messaging on the same service account (push to a phone), or null when no credentials are configured. */
    messaging: () => messaging,
    async revokeUser(uid) {
      if (!auth || !uid) return;
      await auth.revokeRefreshTokens(uid).catch((e) => logger?.warn(`revokeRefreshTokens(${uid}) failed: ${e.message}`));
    },
    async deleteFirebaseUser(uid) {
      if (!auth || !uid) return;
      await auth.deleteUser(uid).catch((e) => logger?.warn(`deleteUser(${uid}) failed: ${e.message}`));
    },
  };
}
