/**
 * The routes the EVENTS service owns that the BFFs serve (docs/EVENTS.md section 5).
 *
 * Events' internal paths mirror the dashboard's `/api` paths for the operator routes (`/api/admin/events/5` -> `/internal/events/admin/events/5`),
 * and prefix the devotee reads with `/public` (`/api/events` -> `/internal/events/public/events`).
 *
 *   EVENTS_ADMIN_ROUTES  operator routes the admin BFF hands to events AFTER the area gate (access/routes.js: area `events` - admin and
 *                        editor edit, viewer views). Events re-checks the permission from the signed token. `task-kinds` is listed
 *                        BEFORE `:id` so the fixed path is not swallowed.
 *   EVENTS_DEVOTEE_ROUTES the devotee routes the MOBILE BFF serves behind its Firebase edge (401 without a token; the verified uid rides as
 *                        the signed `sub`): join, leave, report progress, my events, my badges. Events' answer (status AND body, a 204, a 429
 *                        `too_fast`, a 402, a 409 ...) is relayed unchanged.
 *   EVENTS_PUBLIC_GETS   the devotee reads the mobile BFF serves (published events only); `maxStaleMs` is how long a last good
 *                        anonymous answer may be served if events is down.
 */
const ID = '000000000000000000000001';

const crud = (path) => [
  { method: 'GET', path, to: path, area: 'events' },
  { method: 'POST', path, to: path, area: 'events', successStatus: 201 },
  { method: 'PUT', path: `${path}/:id`, to: `${path}/:id`, area: 'events', sample: `${path}/${ID}` },
  { method: 'DELETE', path: `${path}/:id`, to: `${path}/:id`, area: 'events', sample: `${path}/${ID}` },
];

export const EVENTS_ADMIN_ROUTES = [
  { method: 'GET', path: '/admin/events/task-kinds', to: '/admin/events/task-kinds', area: 'events' },
  ...crud('/admin/events').slice(0, 2),
  { method: 'GET', path: '/admin/events/:id', to: '/admin/events/:id', area: 'events', sample: `/admin/events/${ID}` },
  ...crud('/admin/events').slice(2),
  { method: 'GET', path: '/admin/events/:id/stats', to: '/admin/events/:id/stats', area: 'events', sample: `/admin/events/${ID}/stats` },
  // Masked for roles without `devotees:view` (events does the masking from the signed perms); the area gate is `events:view`.
  { method: 'GET', path: '/admin/events/:id/participants', to: '/admin/events/:id/participants', area: 'events', sample: `/admin/events/${ID}/participants` },
  ...crud('/admin/event-types'),
  ...crud('/admin/event-badges'),
];

export const EVENTS_DEVOTEE_ROUTES = [
  { method: 'POST', path: '/events/:slug/join', to: '/public/events/:slug/join', sample: '/events/garba/join' },
  { method: 'POST', path: '/events/:slug/leave', to: '/public/events/:slug/leave', sample: '/events/garba/leave' },
  { method: 'POST', path: '/events/:slug/milestones/:mKey/tasks/:tKey/progress', to: '/public/events/:slug/milestones/:mKey/tasks/:tKey/progress', sample: '/events/garba/milestones/m1/tasks/t1/progress' },
  { method: 'GET', path: '/me/events', to: '/public/me/events' },
  { method: 'GET', path: '/me/badges', to: '/public/me/badges' },
];

const TEN_MIN = 10 * 60_000;
export const EVENTS_PUBLIC_GETS = [
  { path: '/events', to: '/public/events', maxStaleMs: TEN_MIN },
  { path: '/events/:slug', to: '/public/events/:slug', maxStaleMs: TEN_MIN },
];
