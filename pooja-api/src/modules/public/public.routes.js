import { asyncRouter } from '../../lib/async-handler.js';
import {
  Aarti,
  Deity,
  Faq,
  Festival,
  Knowledge,
  Reminder,
  Seva,
  Temple,
  Tone,
  WallpaperStyle,
} from '../../models.js';
import { engagementEnabled, getCurrentAnnouncement, getSettingsMap } from '../../lib/engagement-client.js';
import { publicHero, publicHome } from '../home/home.public.js';
import { Announcement, Setting } from '../../models.js';

/**
 * Settings and the live announcement: this service's own collections, or - with ENGAGEMENT_URL set - the
 * engagement service (cached, and degrading to defaults/null instead of failing the whole content fetch).
 */
const readSettings = async () =>
  engagementEnabled() ? await getSettingsMap() : Object.fromEntries((await Setting.find().lean()).map((r) => [r.key, r.value]));
const readAnnouncement = async () => {
  if (engagementEnabled()) return getCurrentAnnouncement();
  const a = await Announcement.findOne({ active: true }).sort({ createdAt: -1 }).lean();
  return a ? { title: a.title, body: a.bodyMd, severity: a.severity } : null;
};

// The app fetches all enabled content in one call.
export const publicContent = asyncRouter();
publicContent.get('/content', async (_req, res) => {
  const [
    deities,
    temples,
    aartis,
    festivals,
    sevas,
    knowledge,
    faqs,
    reminders,
    tones,
    wallpaperStyles,
    settings,
    announcement,
    hero,
    home,
  ] = await Promise.all([
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
      readSettings(),
      // The newest live modal announcement doubles as the darshan banner,
      // which used to be one hardcoded i18n string on every temple.
      readAnnouncement(),
      publicHero(),
      publicHome(),
    ]);

  // Settings travel as a flat map; the app coerces the few it cares about.
  res.json({
    deities,
    // `liveUrl` is legacy: the app reads streams from /api/live, and a raw link must not leak while a feed is off-air.
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
    settings,
    announcement,
  });
});
