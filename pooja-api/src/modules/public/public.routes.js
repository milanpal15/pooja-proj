import { asyncRouter } from '../../lib/async-handler.js';
import {
  Aarti,
  Announcement,
  Deity,
  Faq,
  Festival,
  Knowledge,
  Reminder,
  Seva,
  Setting,
  Temple,
  Tone,
  WallpaperStyle,
} from '../../models.js';
import { publicHero, publicHome } from '../home/home.public.js';

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
    settingRows,
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
      Setting.find().lean(),
      // The newest live modal announcement doubles as the darshan banner,
      // which used to be one hardcoded i18n string on every temple.
      Announcement.findOne({ active: true }).sort({ createdAt: -1 }).lean(),
      publicHero(),
      publicHome(),
    ]);

  // Settings travel as a flat map; the app coerces the few it cares about.
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

  res.json({
    deities,
    temples,
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
    announcement: announcement
      ? { title: announcement.title, body: announcement.bodyMd, severity: announcement.severity }
      : null,
  });
});
