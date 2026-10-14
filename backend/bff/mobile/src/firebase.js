import { existsSync, readFileSync } from 'node:fs';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Verifies the Firebase ID tokens the phone app sends (the device edge's one Firebase job; account deletion and
 * refresh-token revocation belong to the identity service). Signature, expiry and audience are checked locally
 * against Google's cached public certs - NOT `checkRevoked`, which costs a Google round trip per request; the
 * per-request blocked check against identity covers revocation.
 *
 * Credential lookup (same order as pooja-api): inline JSON > path > GOOGLE_APPLICATION_CREDENTIALS. With none of those,
 * FIREBASE_PROJECT_ID alone is enough to verify (no secret needed here). With nothing configured the BFF still boots and
 * answers 503 `auth unavailable` to a request that presents a token - never trusts it.
 */
export function createFirebaseVerifier(config, logger) {
  let auth = null;
  let initError = null;
  let projectId = null;
  try {
    const inline = config.firebaseServiceAccount?.trim();
    const path = config.firebaseServiceAccountPath || config.googleApplicationCredentials;
    const json = inline ? JSON.parse(inline) : path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    const options = json ? { credential: cert(json) } : config.firebaseProjectId ? { projectId: config.firebaseProjectId } : null;
    if (options) {
      const app = getApps().find((a) => a.name === 'mobile-bff') ?? initializeApp(options, 'mobile-bff');
      auth = getAuth(app);
      projectId = json?.project_id ?? options.projectId ?? app.options.projectId ?? null;
      logger?.info(`Firebase token verification ready for project "${projectId}"`);
    } else {
      initError = 'neither a service account nor FIREBASE_PROJECT_ID is configured';
    }
  } catch (e) {
    initError = e.message;
  }
  if (!auth) logger?.warn(`Firebase token verification NOT configured (${initError}): every authenticated request will answer 503.`);
  return {
    verifyIdToken: (token) => {
      if (!auth) throw new Error('Firebase Admin is not configured');
      return auth.verifyIdToken(token);
    },
    firebase: { ready: () => auth !== null, error: () => initError, projectId: () => projectId },
  };
}
