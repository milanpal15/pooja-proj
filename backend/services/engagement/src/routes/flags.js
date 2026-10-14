import { asyncRouter } from '../lib/async-handler.js';
import { requirePerm } from '../lib/perms.js';
import { Flag } from '../models/index.js';

export const flagRoutes = asyncRouter();

/** The app reads flags as a simple { key: bool } map. */
flagRoutes.get('/flags', async (_req, res) => {
  const rows = await Flag.find().lean();
  res.json({ flags: Object.fromEntries(rows.map((f) => [f.key, f.enabled])) });
});

/** Dashboard: full flag docs (with labels/descriptions). */
flagRoutes.get('/flags/full', async (_req, res) => {
  res.json(await Flag.find().sort({ key: 1 }).lean());
});

/** Dashboard: toggle a flag. */
flagRoutes.put('/flags/:key', requirePerm('flags:edit'), async (req, res) => {
  const { enabled } = req.body ?? {};
  const flag = await Flag.findOneAndUpdate({ key: req.params.key }, { $set: { enabled: !!enabled } }, { new: true });
  if (!flag) return res.status(404).json({ error: 'flag not found' });
  res.json(flag);
});
