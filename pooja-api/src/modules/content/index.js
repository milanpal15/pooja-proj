import { settingsGuard } from '../../access/settings-guard.js';
import { catalogEnabled } from '../../lib/catalog-client.js';
import { engagementEnabled } from '../../lib/engagement-client.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { uploadRoutes } from '../media/upload.routes.js';
import announcement from '../announcements/announcement.resource.js';
import horoscope from '../horoscope/horoscope.resource.js';
import panchang from '../panchang/panchang.resource.js';
import { crud } from './crud.factory.js';
import aarti from './resources/aarti.resource.js';
import deity from './resources/deity.resource.js';
import faq from './resources/faq.resource.js';
import festival from './resources/festival.resource.js';
import heroSlide from './resources/hero-slide.resource.js';
import knowledge from './resources/knowledge.resource.js';
import reminder from './resources/reminder.resource.js';
import setting from './resources/setting.resource.js';
import seva from './resources/seva.resource.js';
import temple from './resources/temple.resource.js';
import tone from './resources/tone.resource.js';
import wallpaperStyle from './resources/wallpaper-style.resource.js';

/**
 * Every generic content resource, in the order its routes are registered.
 * (Horoscope, panchang and announcements keep their own module for the
 * special endpoints, but their plain CRUD has always lived under
 * `/api/content/*`, so the paths stay.)
 */
export const RESOURCES = [
  deity, temple, aarti, festival, seva, knowledge, faq, heroSlide,
  reminder, tone, wallpaperStyle, setting, horoscope, panchang, announcement,
];

/** `/api/content/*` — one CRUD router per resource, then the media upload. */
export const content = asyncRouter();
// With ENGAGEMENT_URL set, settings and announcements are served by the engagement service (via the admin
// BFF): these two resources step aside so the path falls through to a 404 here. Unset = served as ever.
for (const r of [setting, announcement]) content.use(r.path, (_req, _res, next) => (engagementEnabled() ? next('router') : next()));
// With CATALOG_URL set (phase 3), every other resource - and the media upload - is served by the catalog service the
// same way: the path falls through to a 404 here. (Settings and announcements follow ENGAGEMENT_URL, not this.)
for (const r of RESOURCES) {
  if (r === setting || r === announcement) continue;
  content.use(r.path, (_req, _res, next) => (catalogEnabled() ? next('router') : next()));
}
content.use('/upload', (_req, _res, next) => (catalogEnabled() ? next('router') : next()));
// Money-affecting setting keys need `money:edit`, not just `content:edit`.
content.use('/settings', settingsGuard);
for (const r of RESOURCES) content.use(r.path, crud(r.name, r.Model, r.sort, { prepare: r.prepare, view: r.view, routes: r.routes }));
content.use(uploadRoutes);
