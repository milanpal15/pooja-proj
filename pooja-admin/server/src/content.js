import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

import { Router } from 'express';
import multer from 'multer';

import { Aarti, Announcement, Deity, Temple, User } from './models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = join(__dirname, '..', 'uploads');
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

// App upserts the signed-in user here.
users.post('/', async (req, res) => {
  const { contact, name, method, bio, deviceId } = req.body ?? {};
  if (!contact) return res.status(400).json({ error: 'contact required' });
  const doc = await User.findOneAndUpdate(
    { contact },
    { $set: { name, method, bio, deviceId, lastActive: new Date() } },
    { upsert: true, new: true },
  );
  res.json(doc);
});

users.get('/', async (_req, res) => res.json(await User.find().sort({ lastActive: -1 }).lean()));

users.put('/:id', async (req, res) => {
  const doc = await User.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!doc) return res.status(404).json({ error: 'user not found' });
  res.json(doc);
});

users.delete('/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------------------------ public app content -- */

// The app fetches all enabled content in one call.
export const publicContent = Router();
publicContent.get('/content', async (_req, res) => {
  const [deities, temples, aartis] = await Promise.all([
    Deity.find({ enabled: true }).sort({ order: 1 }).lean(),
    Temple.find({ enabled: true }).sort({ order: 1 }).lean(),
    Aarti.find({ enabled: true }).sort({ order: 1 }).lean(),
  ]);
  res.json({ deities, temples, aartis });
});
