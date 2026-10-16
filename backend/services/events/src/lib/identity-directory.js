import { createServiceClient } from '@bhakti/common';

/**
 * Names and phones for the participants list, asked of identity ONLY for an operator who may see them (devotees:view); everyone else
 * gets pseudonyms and no call is made. Display-only: identity being down never fails the list (the pseudonym is shown instead).
 */
export function createIdentityDirectory(config, { fetchImpl, logger } = {}) {
  if (!config.identityUrl) return { lookup: async () => new Map() };
  const client = createServiceClient({
    service: 'identity', baseUrl: config.identityUrl, iss: 'events', secret: config.secret, timeoutMs: config.serviceTimeoutMs, ...(fetchImpl ? { fetchImpl } : {}),
  });
  return {
    /** uid -> { name, contact }. A uid with no row, or identity down, is simply absent. */
    async lookup(uids) {
      const list = [...new Set(uids.filter(Boolean))];
      if (!list.length) return new Map();
      try {
        const data = await client.post('/internal/identity/directory/lookup', { uids: list });
        return new Map((data?.users ?? []).map((u) => [u.uid, { name: u.name || '', contact: u.contact || '' }]));
      } catch (e) {
        logger?.warn(`identity unreachable for a name lookup (${e?.code || e?.message}): showing pseudonyms`);
        return new Map();
      }
    },
  };
}
