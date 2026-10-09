import { asyncRouter } from '../../lib/async-handler.js';
import { Flag } from './flag.model.js';

export const flags = asyncRouter();

// Public: the mobile app reads flags as a simple { key: bool } map.
flags.get('/flags', async (_req, res) => {
  const flags = await Flag.find().lean();
  const map = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  res.json({ flags: map });
});

// Admin: full flag docs (with labels/descriptions).
flags.get('/flags/full', async (_req, res) => {
  res.json(await Flag.find().sort({ key: 1 }).lean());
});

// Admin: toggle / update a flag.
flags.put('/flags/:key', async (req, res) => {
  const { enabled } = req.body ?? {};
  const flag = await Flag.findOneAndUpdate(
    { key: req.params.key },
    { $set: { enabled: !!enabled } },
    { new: true },
  );
  if (!flag) return res.status(404).json({ error: 'flag not found' });
  res.json(flag);
});
