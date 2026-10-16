/**
 * The operator (dashboard) routes the CATALOG service owns, and the public ones the BFFs serve from it (phase 3).
 *
 * Catalog's internal paths mirror the monolith's `/api` paths exactly (`/api/admin/poojas/5` -> `/internal/catalog/admin/poojas/5`), so
 * `to === path`. This table is the single list of what the admin BFF hands to catalog; the area gate (access/routes.js) runs first,
 * so a role without the area never reaches catalog (which re-checks the permission from the signed token). A path that is
 * NOT here is not catalog's: it falls through to the monolith. Order matters where a fixed path shares a prefix with
 * `/:id` (`PUT /content/hero/order` before `PUT /content/hero/:id`), exactly as in the monolith's routers.
 *
 * `/content/settings` and `/content/announcements` are deliberately absent: they are engagement's (engagement-routes.js).
 */
const ID = '000000000000000000000001';

const crud = (path, { area = 'content', before = [], get = true } = {}) => [
  ...before,
  ...(get ? [{ method: 'GET', path, to: path, area }] : []),
  { method: 'POST', path, to: path, area, successStatus: 201 },
  { method: 'PUT', path: `${path}/:id`, to: `${path}/:id`, area, sample: `${path}/${ID}` },
  { method: 'DELETE', path: `${path}/:id`, to: `${path}/:id`, area, sample: `${path}/${ID}` },
];
const order = (path) => ({ method: 'PUT', path: `${path}/order`, to: `${path}/order`, area: 'content' });

export const CONTENT_RESOURCES = [
  'deities', 'temples', 'aartis', 'festivals', 'sevas', 'knowledge', 'faqs', 'hero', 'reminders', 'tones', 'wallpaper-styles',
  'horoscopes', 'panchangs',
];

const AREA_OF = { horoscopes: 'horoscope', panchangs: 'panchang' };

export const CATALOG_ADMIN_ROUTES = [
  ...CONTENT_RESOURCES.flatMap((r) => crud(`/content/${r}`, { area: AREA_OF[r] ?? 'content', before: r === 'hero' ? [order('/content/hero')] : [] })),
  { method: 'DELETE', path: '/content/upload', to: '/content/upload', area: 'content', body: true },

  ...crud('/admin/home-sections', { before: [order('/admin/home-sections')] }),

  // Home layout v2 (docs/HOME_LAYOUT.md section 4): draft -> publish. Bodies may be large (60 blocks), hence `bodyLimit`.
  { method: 'GET', path: '/admin/home-layout', to: '/admin/home-layout', area: 'content' },
  { method: 'GET', path: '/admin/home-layout/registry', to: '/admin/home-layout/registry', area: 'content' },
  { method: 'PUT', path: '/admin/home-layout/draft', to: '/admin/home-layout/draft', area: 'content', bodyLimit: '1mb' },
  { method: 'POST', path: '/admin/home-layout/validate', to: '/admin/home-layout/validate', area: 'content', bodyLimit: '1mb' },
  { method: 'POST', path: '/admin/home-layout/publish', to: '/admin/home-layout/publish', area: 'content' },
  { method: 'POST', path: '/admin/home-layout/rollback', to: '/admin/home-layout/rollback', area: 'content' },
  { method: 'POST', path: '/admin/home-layout/reset-default', to: '/admin/home-layout/reset-default', area: 'content' },
  { method: 'GET', path: '/admin/home-layout/versions/:n', to: '/admin/home-layout/versions/:n', area: 'content', sample: '/admin/home-layout/versions/1' },

  { method: 'GET', path: '/admin/poojas', to: '/admin/poojas', area: 'content' },
  { method: 'POST', path: '/admin/poojas', to: '/admin/poojas', area: 'content', successStatus: 201 },
  { method: 'POST', path: '/admin/poojas/import-sevas', to: '/admin/poojas/import-sevas', area: 'content' },
  { method: 'GET', path: '/admin/poojas/:id', to: '/admin/poojas/:id', area: 'content', sample: `/admin/poojas/${ID}` },
  { method: 'PUT', path: '/admin/poojas/:id', to: '/admin/poojas/:id', area: 'content', sample: `/admin/poojas/${ID}` },
  { method: 'DELETE', path: '/admin/poojas/:id', to: '/admin/poojas/:id', area: 'content', sample: `/admin/poojas/${ID}` },

  { method: 'GET', path: '/admin/offerings', to: '/admin/offerings', area: 'content' },
  { method: 'POST', path: '/admin/offerings', to: '/admin/offerings', area: 'content', successStatus: 201 },
  { method: 'PUT', path: '/admin/offerings/:id', to: '/admin/offerings/:id', area: 'content', sample: `/admin/offerings/${ID}` },
  { method: 'DELETE', path: '/admin/offerings/:id', to: '/admin/offerings/:id', area: 'content', sample: `/admin/offerings/${ID}` },

  ...crud('/admin/chadhava-listings'),
  ...crud('/admin/chadhava-categories'),

  ...crud('/admin/live-streams', { before: [order('/admin/live-streams'), { method: 'POST', path: '/admin/live-streams/check', to: '/admin/live-streams/check', area: 'content' }] }),
  ...crud('/admin/live-categories', { before: [order('/admin/live-categories')] }),

  { method: 'GET', path: '/horoscope/day/:date', to: '/horoscope/day/:date', area: 'horoscope', sample: '/horoscope/day/2026-01-01' },
  { method: 'PUT', path: '/horoscope/day/:date', to: '/horoscope/day/:date', area: 'horoscope', sample: '/horoscope/day/2026-01-01' },
];

/**
 * The app-facing GETs catalog serves (public, no session). Both BFFs mount them; a path not listed falls through to the monolith -
 * notably `/poojas/:slug/reviews`, which stays with the reviews until phase 5.
 * `ttlMs` is how long a LAST GOOD answer may be served (with `x-degraded: catalog`) if catalog is briefly down: stale-while-error.
 */
const HOUR = 3_600_000;
export const CATALOG_PUBLIC_GETS = [
  { path: '/horoscope', maxStaleMs: HOUR },
  { path: '/panchang', maxStaleMs: HOUR },
  { path: '/live', maxStaleMs: 2 * 60_000 }, // "is it live right now" goes stale fast
  { path: '/live/:slug', maxStaleMs: 2 * 60_000 },
  { path: '/poojas', maxStaleMs: HOUR },
  { path: '/poojas/:slug', maxStaleMs: HOUR },
  { path: '/chadhava/offerings', maxStaleMs: HOUR },
  { path: '/chadhava/listings', maxStaleMs: HOUR },
  { path: '/chadhava/listings/:slug', maxStaleMs: HOUR },
];
