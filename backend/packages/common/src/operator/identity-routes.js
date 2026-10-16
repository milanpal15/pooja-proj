import express from 'express';

import { EXPORT_CAP, EXPORT_PAGE, csvRow } from '../csv.js';
import { createOperatorGate, engagementAdminRouter } from './engagement-routes.js';

/**
 * The operator (dashboard) routes the identity service owns - devotees, operators, audit log, policies. The single list of
 * what the admin BFF hands to identity; the area gate (access/routes.js) runs first, so a role without the area never
 * reaches identity (which re-checks the permission from the signed token).
 *
 *  path    what the dashboard calls (under /api)
 *  to      the identity route behind it (under /internal/identity)
 *  sample  a concrete path for tests (and the route-coverage check)
 */
export const IDENTITY_ADMIN_ROUTES = [
  // The old, unpaginated devotee routes (one more release; the dashboard no longer uses the list). A delete now needs `{ confirm }` like the new one.
  { method: 'GET', path: '/users', to: '/admin/users', area: 'devotees' },
  // The old create answers 410 (only reachable by a signed-in operator allowed to edit devotees, as in the monolith).
  { method: 'POST', path: '/users', to: '/admin/users', area: 'devotees' },
  { method: 'PUT', path: '/users/:id', to: '/admin/users/:id', area: 'devotees', sample: '/users/000000000000000000000001' },
  { method: 'DELETE', path: '/users/:id', to: '/admin/users/:id', area: 'devotees', body: true, sample: '/users/000000000000000000000001' },

  // Users 360 and blocking (docs/USERS.md section 2; BFF-only, pooja-api has none of it). Area `devotees`: GET = view, everything else = edit.
  { method: 'GET', path: '/admin/users', to: '/admin/users/list', area: 'devotees' },
  // Streamed CSV, assembled here from identity's JSON pages (see exportRouter below). Needs `devotees:edit` as well (an `also` row in access/routes.js).
  { method: 'GET', path: '/admin/users/export', to: '/admin/users/export', area: 'devotees', custom: true },
  { method: 'GET', path: '/admin/users/:id', to: '/admin/users/:id', area: 'devotees', sample: '/admin/users/000000000000000000000001' },
  { method: 'POST', path: '/admin/users/:id/block', to: '/admin/users/:id/block', area: 'devotees', sample: '/admin/users/000000000000000000000001/block' },
  { method: 'POST', path: '/admin/users/:id/unblock', to: '/admin/users/:id/unblock', area: 'devotees', sample: '/admin/users/000000000000000000000001/unblock' },
  { method: 'POST', path: '/admin/users/:id/sign-out', to: '/admin/users/:id/sign-out', area: 'devotees', sample: '/admin/users/000000000000000000000001/sign-out' },
  { method: 'POST', path: '/admin/users/:id/tags', to: '/admin/users/:id/tags', area: 'devotees', sample: '/admin/users/000000000000000000000001/tags' },
  { method: 'POST', path: '/admin/users/:id/notes', to: '/admin/users/:id/notes', area: 'devotees', successStatus: 201, sample: '/admin/users/000000000000000000000001/notes' },
  { method: 'DELETE', path: '/admin/users/:id/notes/:noteId', to: '/admin/users/:id/notes/:noteId', area: 'devotees', sample: '/admin/users/000000000000000000000001/notes/abc' },
  { method: 'DELETE', path: '/admin/users/:id', to: '/admin/users/:id', area: 'devotees', body: true, sample: '/admin/users/000000000000000000000001' },
  { method: 'GET', path: '/admin/blocked-devices', to: '/admin/blocked-devices', area: 'devotees' },
  { method: 'POST', path: '/admin/blocked-devices', to: '/admin/blocked-devices', area: 'devotees', relayStatus: true }, // 201 new / 200 changed
  { method: 'DELETE', path: '/admin/blocked-devices/:deviceId', to: '/admin/blocked-devices/:deviceId', area: 'devotees', sample: '/admin/blocked-devices/dev-1' },

  { method: 'GET', path: '/admin/operators', to: '/admin/operators', area: 'operators' },
  { method: 'POST', path: '/admin/operators', to: '/admin/operators', area: 'operators', successStatus: 201 },
  { method: 'PUT', path: '/admin/operators/:id', to: '/admin/operators/:id', area: 'operators', sample: '/admin/operators/000000000000000000000001' },
  { method: 'DELETE', path: '/admin/operators/:id', to: '/admin/operators/:id', area: 'operators', sample: '/admin/operators/000000000000000000000001' },
  // The audit log has its own area (`audit`, admin only): docs/RELEASES.md section 5.
  { method: 'GET', path: '/admin/audit-log', to: '/admin/audit-log', area: 'audit' },

  // Custom roles (docs/ROLES.md section 2). The list is also readable with `operators:view` (the Operators screen shows role names).
  { method: 'GET', path: '/admin/roles', to: '/admin/roles', area: 'roles' },
  { method: 'POST', path: '/admin/roles', to: '/admin/roles', area: 'roles', successStatus: 201 },
  { method: 'PUT', path: '/admin/roles/:key', to: '/admin/roles/:key', area: 'roles', sample: '/admin/roles/support' },
  { method: 'DELETE', path: '/admin/roles/:key', to: '/admin/roles/:key', area: 'roles', sample: '/admin/roles/support' },
  { method: 'POST', path: '/admin/roles/:key/duplicate', to: '/admin/roles/:key/duplicate', area: 'roles', successStatus: 201, sample: '/admin/roles/support/duplicate' },

  { method: 'GET', path: '/admin/policies', to: '/admin/policies', area: 'policies' },
  { method: 'PUT', path: '/admin/policies/:key', to: '/admin/policies/:key', area: 'policies', sample: '/admin/policies/terms' },
];

const NS = '/internal/identity';
const apiPath = (req) => req.path.replace(/^\/api(?=\/)/, '');
const FILTER_KEYS = ['ids', 'q', 'status', 'tag', 'role', 'versionCode', 'lastActiveAfter', 'lastActiveBefore', 'createdFrom', 'createdTo'];
export const EXPORT_HEADER = ['id', 'uid', 'name', 'contact', 'method', 'role', 'blocked', 'tags', 'createdAt', 'lastActive', 'version'];

/**
 * `GET /api/admin/users/export` -> `text/csv`, streamed (docs/USERS.md section 2). Identity answers JSON pages of at most EXPORT_PAGE rows (and audits the
 * export on the first one: filter + row count, before any data leaves); this turns them into CSV as they arrive, never holding more than a page, and
 * stops at EXPORT_CAP rows. The rows are what identity sends an operator who may EDIT devotees - there is no masked version to un-mask.
 */
function exportRouter({ sessions, client }) {
  const router = express.Router();
  const gate = createOperatorGate(sessions);
  router.get('/api/admin/users/export', gate, async (req, res, next) => {
    try {
      const as = { sub: req.operator.id ?? req.operator.username, role: req.operator.role, perms: req.operator.permissions, ctx: { username: req.operator.username } };
      const query = Object.fromEntries(FILTER_KEYS.filter((k) => typeof req.query[k] === 'string' && req.query[k]).map((k) => [k, req.query[k]]));
      const page = (cursor, already) =>
        client.get(`${NS}/admin/users/export`, { reqId: req.id, as, query: { ...query, limit: String(EXPORT_PAGE), already: String(already), ...(cursor ? { cursor } : {}) }, timeoutMs: 30_000 });

      const first = await page(null, 0); // a bad filter / no permission surfaces here as a normal JSON error, before the CSV starts
      res.status(200);
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader('cache-control', 'no-store');
      res.write(`\uFEFF${csvRow(EXPORT_HEADER)}`); // BOM: Excel reads the Devanagari names as UTF-8
      let count = 0;
      for (let out = first; ; ) {
        for (const u of out.rows) {
          if (count >= EXPORT_CAP) break;
          res.write(csvRow([u.id, u.uid, u.name, u.contact, u.method, u.role, u.blocked, (u.tags ?? []).join(';'), u.createdAt, u.lastActive, u.version]));
          count += 1;
        }
        if (!out.next || out.capped || count >= EXPORT_CAP) break;
        out = await page(out.next, count);
      }
      res.end();
    } catch (e) {
      if (res.headersSent) return res.destroy(e); // mid-stream: the download fails visibly rather than ending short
      if (e?.status === 401) return res.status(502).json({ error: 'upstream_unavailable', code: 'identity_auth_failed' });
      next(e);
    }
  });
  return router;
}

export const identityAdminRouter = ({ sessions, client, audit }) => {
  const router = express.Router();
  router.use(exportRouter({ sessions, client })); // before the table: `/admin/users/export` must not be read as `/admin/users/:id`
  router.use(engagementAdminRouter({ sessions, client, audit, routes: IDENTITY_ADMIN_ROUTES.filter((r) => !r.custom), namespace: NS }));
  return router;
};
