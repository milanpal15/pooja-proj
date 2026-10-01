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
  Knowledge,
  Seva,
  Setting,
  Temple,
  User,
} from './models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Project root, not src/ — this file lives at src/server/ now.
export const UPLOAD_DIR = join(__dirname, '..', '..', 'uploads');
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
content.use('/settings', crud('Setting', Setting, { key: 1 }));
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

/* ------------------------------------------------ public app content -- */

// The app fetches all enabled content in one call.
export const publicContent = Router();
publicContent.get('/content', async (_req, res) => {
  const [deities, temples, aartis, festivals, sevas, knowledge, faqs, hero, settingRows, announcement] =
    await Promise.all([
      Deity.find({ enabled: true }).sort({ order: 1 }).lean(),
      Temple.find({ enabled: true }).sort({ order: 1 }).lean(),
      Aarti.find({ enabled: true }).sort({ order: 1 }).lean(),
      Festival.find({ enabled: true }).sort({ date: 1 }).lean(),
      Seva.find({ enabled: true }).sort({ order: 1 }).lean(),
      Knowledge.find({ enabled: true }).sort({ order: 1 }).lean(),
      Faq.find({ enabled: true }).sort({ order: 1 }).lean(),
      HeroSlide.find({ enabled: true }).sort({ order: 1 }).lean(),
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
    settings,
    announcement: announcement
      ? { title: announcement.title, body: announcement.bodyMd, severity: announcement.severity }
      : null,
  });
});
