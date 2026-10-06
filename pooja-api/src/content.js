import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

import { Router } from 'express';
import multer from 'multer';

import { deleteFirebaseUser, revokeUser } from './firebase.js';
import {
  Aarti,
  Announcement,
  Deity,
  Faq,
  Festival,
  HeroSlide,
  Horoscope,
  Knowledge,
  Panchang,
  Seva,
  Setting,
  Temple,
  User,
  Reminder,
  Tone,
  WallpaperStyle,
} from './models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * Where uploaded artwork is written.
 *
 * Defaults to the project root (not src/ — this file lives at src/server/).
 * UPLOAD_DIR overrides it, which is what a hosted deploy needs: the
 * container filesystem is wiped on every release, so this has to point at a
 * mounted disk or the images disappear with nothing in the logs to say why.
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname) || ''}`),
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

export const content = Router();

/** Build a generic CRUD router for a Mongoose model. */
function crud(ModelName, Model, sort = { order: 1, createdAt: 1 }) {
  const r = Router();
  r.get('/', async (_req, res) => res.json(await Model.find().sort(sort).lean()));
  r.post('/', async (req, res) => {
    try {
      res.status(201).json(await Model.create(req.body));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  r.put('/:id', async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!doc) return res.status(404).json({ error: `${ModelName} not found` });
    res.json(doc);
  });
  r.delete('/:id', async (req, res) => {
    await Model.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });
  return r;
}

content.use('/deities', crud('Deity', Deity));
content.use('/temples', crud('Temple', Temple));
content.use('/aartis', crud('Aarti', Aarti));
// Sorted by date, not `order` — a calendar has one natural sequence.
content.use('/festivals', crud('Festival', Festival, { date: 1 }));
content.use('/sevas', crud('Seva', Seva));
content.use('/knowledge', crud('Knowledge', Knowledge));
content.use('/faqs', crud('Faq', Faq));
content.use('/hero', crud('HeroSlide', HeroSlide));
content.use('/reminders', crud('Reminder', Reminder));
content.use('/tones', crud('Tone', Tone));
content.use('/wallpaper-styles', crud('WallpaperStyle', WallpaperStyle));
content.use('/settings', crud('Setting', Setting, { key: 1 }));
content.use('/horoscopes', crud('Horoscope', Horoscope, { date: -1, rashi: 1 }));
content.use('/panchangs', crud('Panchang', Panchang, { date: -1 }));
content.use('/announcements', crud('Announcement', Announcement, { createdAt: -1 }));

/* -------------------------------------------------------------- upload -- */

// Returns a HOST-RELATIVE URL for the uploaded file (image or audio). Clients
// (dashboard + mobile app) resolve it against their own API base, so the same
// stored value works from localhost, the LAN IP, or any future host.
content.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

/* --------------------------------------------------------------- users -- */

export const users = Router();

/**
 * Accounts are created by `POST /api/auth/sync`, which requires a verified
 * Firebase ID token. This endpoint used to accept any `{contact, name}` body
 * from anyone — that is exactly how a stranger got to be any account — so it
 * is kept only to give an old build a clear answer instead of a 404.
 */
users.post('/', (_req, res) =>
  res.status(410).json({
    error: 'gone',
    detail: 'Sign-in now goes through Firebase. Use POST /api/auth/sync with a Bearer ID token.',
  }),
);

users.get('/', async (_req, res) => res.json(await User.find().sort({ lastActive: -1 }).lean()));

/**
 * Dashboard edits. Blocking is enforced on the API by `requireAuth`, but the
 * app could keep using an already-minted ID token for up to an hour, so the
 * refresh tokens are revoked too — that logs the device out for real.
 */
users.put('/:id', async (req, res) => {
  const { name, bio, blocked } = req.body ?? {};
  const doc = await User.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        ...(name !== undefined ? { name } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(blocked !== undefined ? { blocked: !!blocked } : {}),
      },
    },
    { new: true },
  );
  if (!doc) return res.status(404).json({ error: 'user not found' });
  if (blocked) await revokeUser(doc.uid);
  res.json(doc);
});

// Removing the devotee here removes the Firebase account too — otherwise the
// next sign-in would silently recreate the row from the surviving credential.
users.delete('/:id', async (req, res) => {
  const doc = await User.findByIdAndDelete(req.params.id);
  if (doc?.uid) await deleteFirebaseUser(doc.uid);
  res.json({ ok: true });
});

/* ----------------------------------------------------------- horoscope -- */

/** The twelve signs, in the traditional order. Also the bulk editor's shape. */
export const RASHIS = [
  'mesha', 'vrishabha', 'mithuna', 'karka', 'simha', 'kanya',
  'tula', 'vrischika', 'dhanu', 'makara', 'kumbha', 'meena',
];


/**
 * Today's readings, or a given day's.
 *
 * Its own endpoint rather than part of `/api/content`: horoscopes are one
 * row per sign per day, so bundling them into the content payload would
 * grow it without bound and ship 11 signs nobody asked for on every launch.
 *
 * Returns whatever exists. An empty array is a real answer — the app says
 * nothing is published rather than inventing a reading.
 */
export const horoscope = Router();

/**
 * Every sign for one day, read and written in a single call.
 *
 * Horoscopes are twelve rows a day, and entering them one modal at a time is
 * twelve open-type-save cycles for something that is really one editorial
 * act. The dashboard's day editor uses this pair.
 *
 * The write upserts on (rashi, date), so re-publishing a day corrects it
 * rather than colliding with the unique index. A sign left blank is deleted
 * rather than stored empty, which keeps "no reading published" meaning
 * exactly that in the app.
 */
horoscope.get('/horoscope/day/:date', async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date' });

  const rows = await Horoscope.find({ date }).lean();
  const byRashi = Object.fromEntries(rows.map((r) => [r.rashi, r]));
  res.json({
    date,
    readings: RASHIS.map((rashi) => ({
      rashi,
      prediction: byRashi[rashi]?.prediction ?? '',
      predictionHi: byRashi[rashi]?.predictionHi ?? '',
      luckyColor: byRashi[rashi]?.luckyColor ?? '',
      luckyColorHi: byRashi[rashi]?.luckyColorHi ?? '',
      luckyNumber: byRashi[rashi]?.luckyNumber ?? '',
      enabled: byRashi[rashi]?.enabled ?? true,
    })),
  });
});

horoscope.put('/horoscope/day/:date', async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date' });

  const incoming = Array.isArray(req.body?.readings) ? req.body.readings : [];
  let saved = 0;
  let removed = 0;

  for (const r of incoming) {
    if (!RASHIS.includes(r.rashi)) continue;
    const text = String(r.prediction ?? '').trim();
    const textHi = String(r.predictionHi ?? '').trim();

    // Nothing written for this sign — drop any previous row for the day.
    if (!text && !textHi) {
      const { deletedCount } = await Horoscope.deleteOne({ rashi: r.rashi, date });
      removed += deletedCount ?? 0;
      continue;
    }

    await Horoscope.updateOne(
      { rashi: r.rashi, date },
      {
        $set: {
          prediction: text,
          predictionHi: textHi,
          luckyColor: String(r.luckyColor ?? '').trim(),
          luckyColorHi: String(r.luckyColorHi ?? '').trim(),
          luckyNumber: String(r.luckyNumber ?? '').trim(),
          enabled: r.enabled !== false,
        },
      },
      { upsert: true },
    );
    saved += 1;
  }

  res.json({ date, saved, removed });
});
horoscope.get('/horoscope', async (req, res) => {
  const date = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(req.query.date)
    : new Date().toISOString().slice(0, 10);

  const rows = await Horoscope.find({ date, enabled: true }).lean();
  res.json({
    date,
    readings: rows.map((r) => ({
      rashi: r.rashi,
      prediction: r.prediction ?? '',
      predictionHi: r.predictionHi ?? '',
      luckyColor: r.luckyColor ?? '',
      luckyColorHi: r.luckyColorHi ?? '',
      luckyNumber: r.luckyNumber ?? '',
    })),
  });
});

/* ------------------------------------------------------------ panchang -- */

/**
 * A temple's panchang override for one day, or null.
 *
 * Null is the normal answer: the device computes panchang itself and only
 * needs this when a temple publishes something different. Returning null
 * rather than 404 keeps the app's handling to one branch.
 */
export const panchang = Router();
panchang.get('/panchang', async (req, res) => {
  const date = String(req.query.date || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(req.query.date)
    : new Date().toISOString().slice(0, 10);

  const row = await Panchang.findOne({ date, enabled: true }).lean();
  if (!row) return res.json({ date, override: null });

  // Only the fields actually filled in travel; a blank must not blank out
  // what the device computed correctly.
  const keys = ['tithi','paksha','nakshatra','yoga','karana','masa','ritu','sunrise','sunset','rahuKaal','yamaganda','gulika','abhijit','note','noteHi'];
  const override = {};
  for (const k of keys) if (row[k]) override[k] = row[k];

  res.json({ date, override: Object.keys(override).length ? override : null });
});

/* ------------------------------------------------ public app content -- */

// The app fetches all enabled content in one call.
export const publicContent = Router();
publicContent.get('/content', async (_req, res) => {
  const [
    deities,
    temples,
    aartis,
    festivals,
    sevas,
    knowledge,
    faqs,
    hero,
    reminders,
    tones,
    wallpaperStyles,
    settingRows,
    announcement,
  ] = await Promise.all([
      Deity.find({ enabled: true }).sort({ order: 1 }).lean(),
      Temple.find({ enabled: true }).sort({ order: 1 }).lean(),
      Aarti.find({ enabled: true }).sort({ order: 1 }).lean(),
      Festival.find({ enabled: true }).sort({ date: 1 }).lean(),
      Seva.find({ enabled: true }).sort({ order: 1 }).lean(),
      Knowledge.find({ enabled: true }).sort({ order: 1 }).lean(),
      Faq.find({ enabled: true }).sort({ order: 1 }).lean(),
      HeroSlide.find({ enabled: true }).sort({ order: 1 }).lean(),
      Reminder.find({ enabled: true }).sort({ order: 1 }).lean(),
      Tone.find({ enabled: true }).sort({ order: 1 }).lean(),
      WallpaperStyle.find({ enabled: true }).sort({ order: 1 }).lean(),
      Setting.find().lean(),
      // The newest live modal announcement doubles as the darshan banner,
      // which used to be one hardcoded i18n string on every temple.
      Announcement.findOne({ active: true }).sort({ createdAt: -1 }).lean(),
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
    reminders,
    tones,
    wallpaperStyles,
    settings,
    announcement: announcement
      ? { title: announcement.title, body: announcement.bodyMd, severity: announcement.severity }
      : null,
  });
});
