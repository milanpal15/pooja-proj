import express from 'express';

import { areaFor } from './access/routes.js';
import { hasPermission } from './access/permissions.js';
import { decodeAuditDetail } from './audit.js';

/**
 * The operator (dashboard) routes the engagement service owns. This table is the single list of what the admin
 * BFF handles itself; everything else is streamed to the monolith, which applies its own gate.
 *
 *  path    what the dashboard calls (under /api), also the key into access/routes.js (the area gate)
 *  to      the engagement route behind it
 *  sample  a concrete path for tests (and the route-coverage check)
 *  successStatus  the status the monolith answered on success when it is not 200 (a create answers 201)
 *  body    send the JSON body on a DELETE
 *  bodyLimit  JSON body size limit for this route (default 100kb)
 *  relayStatus  answer with the service's own 2xx status (e.g. 200 vs 202) instead of `successStatus`
 *  audit   `false` = a POST that only reads (an impact preview): never written to the audit log
 */
export const ENGAGEMENT_ADMIN_ROUTES = [
  { method: 'GET', path: '/flags/full', to: '/flags/full', area: 'flags' },
  { method: 'PUT', path: '/flags/:key', to: '/flags/:key', area: 'flags', sample: '/flags/bhajan' },

  { method: 'GET', path: '/analytics/summary', to: '/analytics/summary', area: 'overview' },
  { method: 'GET', path: '/analytics/trend', to: '/analytics/trend', area: 'overview' },
  { method: 'GET', path: '/visitors', to: '/visitors', area: 'overview' },

  // Settings ride the content router in the monolith; money-affecting rows are re-checked by engagement from the token.
  { method: 'GET', path: '/content/settings', to: '/admin/settings', area: 'content' },
  { method: 'POST', path: '/content/settings', to: '/admin/settings', area: 'content', successStatus: 201 },
  { method: 'PUT', path: '/content/settings/:id', to: '/admin/settings/:id', area: 'content', sample: '/content/settings/000000000000000000000001' },
  { method: 'DELETE', path: '/content/settings/:id', to: '/admin/settings/:id', area: 'content', sample: '/content/settings/000000000000000000000001' },

  { method: 'GET', path: '/content/announcements', to: '/admin/announcements', area: 'announcements' },
  { method: 'POST', path: '/content/announcements', to: '/admin/announcements', area: 'announcements', successStatus: 201 },
  { method: 'PUT', path: '/content/announcements/:id', to: '/admin/announcements/:id', area: 'announcements', sample: '/content/announcements/000000000000000000000001' },
  { method: 'DELETE', path: '/content/announcements/:id', to: '/admin/announcements/:id', area: 'announcements', sample: '/content/announcements/000000000000000000000001' },
  { method: 'POST', path: '/admin/announcements/:id/push', to: '/admin/announcements/:id/push', area: 'push', sample: '/admin/announcements/000000000000000000000001/push' },

  // App releases, version policy, approvals (docs/RELEASES.md section 5; BFF-only, pooja-api has none of it).
  { method: 'GET', path: '/admin/releases', to: '/admin/releases', area: 'releases' },
  { method: 'POST', path: '/admin/releases', to: '/admin/releases', area: 'releases', successStatus: 201 },
  { method: 'PUT', path: '/admin/releases/:id', to: '/admin/releases/:id', area: 'releases', sample: '/admin/releases/000000000000000000000001' },
  { method: 'POST', path: '/admin/releases/:id/withdraw', to: '/admin/releases/:id/withdraw', area: 'releases', sample: '/admin/releases/000000000000000000000001/withdraw' },
  { method: 'PUT', path: '/admin/version-policy', to: '/admin/version-policy', area: 'releases', relayStatus: true }, // 200 applied / 202 sent for approval
  { method: 'POST', path: '/admin/version-policy/impact', to: '/admin/version-policy/impact', area: 'releases', audit: false }, // a read-only what-if
  { method: 'GET', path: '/admin/versions/usage', to: '/admin/versions/usage', area: 'releases' },
  { method: 'GET', path: '/admin/approvals', to: '/admin/approvals', area: 'approvals' },
  { method: 'GET', path: '/admin/approvals/settings', to: '/admin/approvals/settings', area: 'approvals' },
  { method: 'PUT', path: '/admin/approvals/settings', to: '/admin/approvals/settings', area: 'approvals' },
  { method: 'POST', path: '/admin/approvals/:id/approve', to: '/admin/approvals/:id/approve', area: 'approvals', sample: '/admin/approvals/000000000000000000000001/approve' },
  { method: 'POST', path: '/admin/approvals/:id/reject', to: '/admin/approvals/:id/reject', area: 'approvals', sample: '/admin/approvals/000000000000000000000001/reject' },
  { method: 'POST', path: '/admin/approvals/:id/cancel', to: '/admin/approvals/:id/cancel', area: 'approvals', sample: '/admin/approvals/000000000000000000000001/cancel' },
];

/** The path as the gate sees it: without the `/api` prefix (access/routes.js is keyed that way). */
const apiPath = (req) => req.path.replace(/^\/api(?=\/)/, '');

const FORBIDDEN = "You don't have permission for that.";

/**
 * The operator area gate as Express middleware: resolves the session (`req.operator`), then the same decision as the monolith's
 * requireAdmin - path -> area (unmapped = admin-only) -> `<area>:<level>`. Shared by every route family an admin BFF serves.
 * @param {{resolve:(req)=>Promise<object>}} sessions   operator-session.js / identity-session.js
 */
export function createOperatorGate(sessions) {
  return async (req, res, next) => {
    try {
      const s = await sessions.resolve(req);
      if (!s.ok) return res.status(s.status).json(s.body);
      req.operator = s.operator;
      const { area, level, also, viewAlso } = areaFor(req.method, apiPath(req));
      const needs = `${area}:${level}`;
      const deny = (perm) => res.status(403).json({ error: FORBIDDEN, code: 'forbidden', needs: perm });
      if (!hasPermission(s.operator.permissions, needs) && !(level === 'view' && viewAlso && hasPermission(s.operator.permissions, viewAlso))) return deny(needs);
      if (also && !hasPermission(s.operator.permissions, also)) return deny(also);
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * @param {object} o
 * @param {{resolve:(req)=>Promise<object>}} o.sessions   operator-session.js
 * @param {*} o.client      @bhakti/common service client for engagement
 * @param {(entry:object)=>void} [o.audit]
 */
export function engagementAdminRouter({ sessions, client, audit, routes = ENGAGEMENT_ADMIN_ROUTES, namespace = '/internal/engagement' }) {
  const router = express.Router();
  const json = express.json();
  const bigJson = new Map(); // bodyLimit -> parser
  const parserFor = (r) => (r.bodyLimit ? (bigJson.get(r.bodyLimit) ?? bigJson.set(r.bodyLimit, express.json({ limit: r.bodyLimit })).get(r.bodyLimit)) : json);
  const gate = createOperatorGate(sessions);

  for (const r of routes) {
    router[r.method.toLowerCase()](`/api${r.path}`, gate, parserFor(r), async (req, res, next) => {
      try {
        const to = r.to.replace(/:(\w+)/g, (_m, k) => encodeURIComponent(req.params[k]));
        // `id` exists only when identity owns the session; the id (not the username) is what identity's "is this me?" refusals compare.
        const as = { sub: req.operator.id ?? req.operator.username, role: req.operator.role, perms: req.operator.permissions, ctx: { username: req.operator.username } };
        const opts = { reqId: req.id, as, query: req.query && Object.keys(req.query).length ? Object.fromEntries(Object.entries(req.query).filter(([, v]) => typeof v === 'string')) : undefined };
        // GET and DELETE carry no body, except a route that says so (`body: true`, e.g. DELETE /content/upload {url}).
        const call = (r.method === 'GET' || r.method === 'DELETE') && !r.body
          ? client.request(r.method, `${namespace}${to}`, { ...opts, full: true })
          : client.request(r.method, `${namespace}${to}`, { ...opts, body: req.body ?? {}, full: true });
        const out = await call;
        // The service's `x-audit-detail` (what changed) goes to the audit log; it is never copied into the reply.
        const detail = decodeAuditDetail(out.auditDetail);
        res.status(r.relayStatus ? out.status : (r.successStatus ?? 200)).json(out.data);
        if (r.audit !== false) audit?.({ operator: req.operator, method: r.method, path: apiPath(req), status: res.statusCode, reqId: req.id, ...(detail ? { detail } : {}) });
      } catch (e) {
        // A rejected service token is OUR misconfiguration, not the operator's session: never answer 401 (the
        // dashboard would sign them out). Everything else from engagement passes through unchanged.
        if (e?.status === 401) return res.status(502).json({ error: 'upstream_unavailable', code: `${namespace.split('/').pop()}_auth_failed` });
        next(e);
      }
    });
  }
  return router;
}
