import { createServiceClient } from '@bhakti/common';

/**
 * How many ACTIVE operators hold a permission (docs/RELEASES.md section 5: a risky change needs a second approver, unless the requester
 * is the only one who could approve). Identity owns operators and roles, so engagement asks it.
 *
 * `count()` resolves a number, `null` when identity cannot be asked (the caller then refuses the risky change with 503 rather than guess),
 * or `1` when IDENTITY_URL is unset (a lone developer stack: the requester is the only operator that exists).
 */
export function createApprovers(config, { fetchImpl, logger } = {}) {
  if (!config.identityUrl) return { count: async () => 1 };
  const client = createServiceClient({
    service: 'identity', baseUrl: config.identityUrl, iss: 'engagement', secret: config.secret, timeoutMs: config.serviceTimeoutMs, ...(fetchImpl ? { fetchImpl } : {}),
  });
  return {
    async count(perm = 'approvals:edit', reqId) {
      try {
        const out = await client.get('/internal/identity/directory/approvers', { query: { perm }, reqId, timeoutMs: 2500 });
        return Number.isInteger(out?.count) ? out.count : null;
      } catch (e) {
        logger?.warn(`identity unreachable for the approver count (${e?.code || e?.message})`);
        return null;
      }
    },
  };
}
