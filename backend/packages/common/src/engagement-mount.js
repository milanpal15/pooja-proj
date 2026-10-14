/**
 * Everything a BFF needs to put the engagement service behind its `/api` surface (phase 1), in one call, so the
 * mobile and admin BFFs cannot drift:
 *   - the public routes the engagement service owns (flags, announcements, ingest, push register);
 *   - the operator routes it owns (flags, analytics, settings, announcements, push), behind the area gate.
 *
 * Both BFFs serve BOTH sets because the monolith's routes were reachable through either BFF in phase 0
 * (scripts/smoke.mjs runs through both) and "no contract change" is the rule. When the identity phase moves
 * operator auth into the admin BFF, the operator routes leave the mobile BFF.
 *
 * Returns `null` when ENGAGEMENT_URL is unset: the BFF is then the phase-0 pure gateway.
 */
import { createServiceClient } from './client.js';
import { engagementPublicRouter } from './engagement-public.js';
import { signServiceToken } from './jwt.js';
import { createAuditor } from './operator/audit.js';
import { engagementAdminRouter } from './operator/engagement-routes.js';
import { createSessionResolver } from './operator/operator-session.js';
import { probeUpstream } from './proxy.js';

/**
 * @param {string} iss  'mobile-bff' | 'admin-bff'
 * @param {object} [o.operator]  identity phase: `false` = this BFF serves no operator routes (the mobile BFF), or
 *        `{ sessions, audit }` = the admin BFF's identity-backed session resolver and auditor. Omitted = phase 1 (ask the
 *        monolith for the session, audit through the monolith).
 * @param {{engagementUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number, monolithUrl:string}} config
 */
export function createEngagementMount(iss, config, { logger, fetchImpl, operator } = {}) {
  if (!config.engagementUrl) return null;
  const extra = fetchImpl ? { fetchImpl } : {};
  const client = createServiceClient({
    service: 'engagement',
    baseUrl: config.engagementUrl,
    iss,
    secret: config.internalJwtSecret,
    timeoutMs: config.serviceTimeoutMs,
    ...extra,
  });
  const legacy = operator === undefined; // phase 1: the monolith still owns the operator session and the audit log
  const sessions = legacy ? createSessionResolver({ monolithUrl: config.monolithUrl, timeoutMs: config.serviceTimeoutMs, ...extra }) : operator?.sessions;
  const audit = legacy
    ? createAuditor({
        iss,
        monolithUrl: config.monolithUrl,
        logger,
        signToken: (claims) => signServiceToken(claims, { secret: config.internalJwtSecret }),
        ...extra,
      })
    : operator?.audit;
  return {
    softDeps: { engagement: () => probeUpstream(config.engagementUrl, '/health') },
    mount: (app) => {
      app.use(engagementPublicRouter({ client, logger }));
      if (operator !== false) app.use(engagementAdminRouter({ sessions, client, audit }));
    },
  };
}
