import { asyncRouter } from '../../lib/async-handler.js';
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
import seva from './resources/seva.resource.js';
import temple from './resources/temple.resource.js';
import tone from './resources/tone.resource.js';
import wallpaperStyle from './resources/wallpaper-style.resource.js';

/**
 * Every generic content resource the catalog owns, in the order its routes are registered. NOT here: `settings` and
 * `announcements` (the engagement service serves those under the same `/api/content/*` paths).
 */
export const RESOURCES = [
  deity, temple, aarti, festival, seva, knowledge, faq, heroSlide,
  reminder, tone, wallpaperStyle, horoscope, panchang,
];

/** `/content/<resource>` - one CRUD router per resource (the dashboard's generic content tabs). */
export const content = asyncRouter();
for (const r of RESOURCES) content.use(r.path, crud(r.name, r.Model, r.sort, { prepare: r.prepare, view: r.view, routes: r.routes }));
