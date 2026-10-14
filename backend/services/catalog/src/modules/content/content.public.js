import { asyncRouter } from '../../lib/async-handler.js';
import { Aarti, Deity, Faq, Festival, Knowledge, Reminder, Seva, Temple, Tone, WallpaperStyle } from '../../models.js';
import { publicHero, publicHome } from '../home/home.public.js';

/**
 * Everything `GET /api/content` serves EXCEPT `settings` and `announcement` (engagement's): the BFF composes the final
 * body in the monolith's key order (deities, temples, aartis, festivals, sevas, knowledge, faqs, hero, home, reminders,
 * tones, wallpaperStyles, settings, announcement). Same queries as the monolith's modules/public/public.routes.js.
 *
 * `liveUrl` is legacy on a temple: the app reads streams from /api/live, and a raw link must not leak while a feed is
 * off-air - so it is stripped here, before anything leaves this service.
 */
export const publicContentRoutes = asyncRouter();
publicContentRoutes.get('/public/content', async (_req, res) => {
  const [deities, temples, aartis, festivals, sevas, knowledge, faqs, reminders, tones, wallpaperStyles, hero, home] = await Promise.all([
    Deity.find({ enabled: true }).sort({ order: 1 }).lean(),
    Temple.find({ enabled: true }).sort({ order: 1 }).lean(),
    Aarti.find({ enabled: true }).sort({ order: 1 }).lean(),
    Festival.find({ enabled: true }).sort({ date: 1 }).lean(),
    Seva.find({ enabled: true }).sort({ order: 1 }).lean(),
    Knowledge.find({ enabled: true }).sort({ order: 1 }).lean(),
    Faq.find({ enabled: true }).sort({ order: 1 }).lean(),
    Reminder.find({ enabled: true }).sort({ order: 1 }).lean(),
    Tone.find({ enabled: true }).sort({ order: 1 }).lean(),
    WallpaperStyle.find({ enabled: true }).sort({ order: 1 }).lean(),
    publicHero(),
    publicHome(),
  ]);
  res.json({
    deities,
    temples: temples.map(({ liveUrl: _legacy, ...t }) => t),
    aartis,
    festivals,
    sevas,
    knowledge,
    faqs,
    hero,
    home,
    reminders,
    tones,
    wallpaperStyles,
  });
});
