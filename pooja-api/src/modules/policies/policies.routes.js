import { asyncRouter } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { User } from '../../models.js';
import { Policy } from './policy.model.js';

/**
 * Rules & regulations: the policy devotees accept at sign-up, authored as
 * Markdown in the dashboard and rendered by the app.
 */

export const policies = asyncRouter();

/** Public: the app fetches the current policy to render and to compare versions. */
policies.get('/policy/:key', async (req, res) => {
  const doc = await Policy.findOne({ key: req.params.key }).lean();
  if (!doc) return res.status(404).json({ error: 'policy not found' });
  res.json(doc);
});

/** Admin: list every policy. */
policies.get('/admin/policies', async (_req, res) => {
  res.json(await Policy.find().sort({ key: 1 }).lean());
});

/**
 * Admin: save a policy.
 *
 * `?publish=1` bumps the version, which invalidates every prior acceptance
 * and forces devotees to read it again. Saving without publishing is for
 * typos — it must not nag the whole user base.
 */
policies.put('/admin/policies/:key', async (req, res) => {
  const { title, bodyMd } = req.body ?? {};
  const publish = req.query.publish === '1';

  const current = await Policy.findOne({ key: req.params.key });
  const update = { title, bodyMd };
  if (publish) {
    update.version = (current?.version ?? 0) + 1;
    update.publishedAt = new Date();
  }

  const doc = await Policy.findOneAndUpdate(
    { key: req.params.key },
    { $set: update },
    { new: true, upsert: true },
  );
  res.json(doc);
});

/**
 * App: record that this devotee accepted a policy version.
 *
 * Identity comes from the verified Firebase token, never the body. This route
 * is on the gate's PUBLIC list (a devotee has no operator session), so it must
 * authenticate itself. It used to take `{ contact }` from the body and update
 * whichever user matched, which let anyone mark any account as having accepted
 * anything — and, because the body could carry a query operator such as
 * `{"$ne":null}`, update an arbitrary user. `key` becomes a field NAME in the
 * update, so it is restricted to a plain slug.
 */
policies.post('/policy/:key/accept', requireAuth, async (req, res) => {
  const key = req.params.key;
  if (!/^[a-z0-9_-]{1,40}$/i.test(key)) return res.status(400).json({ error: 'invalid policy key' });
  await User.updateOne({ uid: req.token.uid }, { $set: { [`acceptedPolicies.${key}`]: Number(req.body?.version) || 1 } });
  res.json({ ok: true });
});
