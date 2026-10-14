import { createServiceClient } from '@bhakti/common';

import { HttpError } from './http-error.js';

/**
 * The wallet's window onto the identity service (the devotee directory). Two uses, both display-only: the `who` column of the admin
 * ledger / order lists (a name; failure = the uid is shown instead), and the admin wallet search (a name or phone to a uid; failure =
 * a clear 503). No balance is ever decided from anything here.
 */
export function createIdentityDirectory(config, { fetchImpl, logger } = {}) {
  const client = createServiceClient({
    service: 'identity',
    baseUrl: config.identityUrl,
    iss: 'wallet',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  /** Map uid -> `name || contact`. A uid with no row, or identity down, is simply absent. */
  async function whoByUid(uids) {
    const list = [...new Set(uids.filter(Boolean))];
    if (!list.length) return new Map();
    try {
      const data = await client.post('/internal/identity/directory/lookup', { uids: list });
      return new Map((data?.users ?? []).map((u) => [u.uid, u.name || u.contact]));
    } catch (e) {
      logger?.warn(`identity unreachable for a name lookup (${e?.code || e?.message}): showing uids`);
      return new Map();
    }
  }

  /** Devotees matching a free-text query. `as` = the operator's claims (identity re-checks `devotees:view`). */
  async function search(q, as) {
    try {
      return (await client.get(`/internal/identity/directory/search?q=${encodeURIComponent(q)}`, { as }))?.users ?? [];
    } catch (e) {
      if (e?.status === 403) throw new HttpError(403, 'forbidden', "You don't have permission for that.", { needs: 'devotees:view' });
      throw new HttpError(503, 'identity_unavailable', 'The devotee directory is unavailable right now.');
    }
  }
  return { whoByUid, search, client };
}
