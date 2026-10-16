import { engagementAdminRouter } from './engagement-routes.js';

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
  { method: 'GET', path: '/users', to: '/admin/users', area: 'devotees' },
  // The old create answers 410 (only reachable by a signed-in operator allowed to edit devotees, as in the monolith).
  { method: 'POST', path: '/users', to: '/admin/users', area: 'devotees' },
  { method: 'PUT', path: '/users/:id', to: '/admin/users/:id', area: 'devotees', sample: '/users/000000000000000000000001' },
  { method: 'DELETE', path: '/users/:id', to: '/admin/users/:id', area: 'devotees', sample: '/users/000000000000000000000001' },

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

export const identityAdminRouter = ({ sessions, client, audit }) =>
  engagementAdminRouter({ sessions, client, audit, routes: IDENTITY_ADMIN_ROUTES, namespace: '/internal/identity' });
