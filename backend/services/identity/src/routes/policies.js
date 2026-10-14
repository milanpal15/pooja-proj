import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { onlyFrom, requirePerm } from '../lib/perms.js';
import { Policy, User } from '../models/index.js';
import { devoteeOf } from '../lib/perms.js';

/**
 * Rules & regulations: the policy devotees accept at sign-up, authored as Markdown in the dashboard and rendered by
 * the app. Moved from pooja-api/modules/policies. Acceptances are kept on the devotee (`users.acceptedPolicies`), which
 * is why policies live in the same service as users.
 */
export function policyRoutes() {
  const pub = asyncRouter(); // GET /policy/:key - both BFFs may read
  pub.get('/policy/:key', onlyFrom('mobile-bff', 'admin-bff'), async (req, res) => {
    const doc = await Policy.findOne({ key: req.params.key }).lean();
    if (!doc) return res.status(404).json({ error: 'policy not found' });
    res.json(doc);
  });

  /**
   * Record that this devotee accepted a policy version. The devotee is the verified token's subject, never the body.
   * `key` becomes a field NAME in the update, so it is restricted to a plain slug.
   */
  pub.post('/policy/:key/accept', onlyFrom('mobile-bff'), async (req, res) => {
    const key = req.params.key;
    if (!/^[a-z0-9_-]{1,40}$/i.test(key)) return res.status(400).json({ error: 'invalid policy key' });
    await User.updateOne({ uid: devoteeOf(req).uid }, { $set: { [`acceptedPolicies.${key}`]: Number(req.body?.version) || 1 } });
    res.json({ ok: true });
  });

  const admin = asyncRouter(); // mounted at /admin/policies
  admin.use(onlyFrom('admin-bff'));
  admin.get('/', requirePerm('policies:view'), async (_req, res) => res.json(await Policy.find().sort({ key: 1 }).lean()));

  /**
   * Save a policy. `?publish=1` bumps the version, which invalidates every prior acceptance and forces devotees to read
   * it again; saving without publishing is for typos and must not nag the whole user base.
   */
  admin.put('/:key', requirePerm('policies:edit'), async (req, res) => {
    const { title, bodyMd } = req.body ?? {};
    if (!/^[a-z0-9_-]{1,40}$/i.test(req.params.key)) throw new HttpError(400, 'bad_request', 'invalid policy key');
    const publish = req.query.publish === '1';
    const current = await Policy.findOne({ key: req.params.key });
    const update = { title, bodyMd };
    if (publish) {
      update.version = (current?.version ?? 0) + 1;
      update.publishedAt = new Date();
    }
    res.json(await Policy.findOneAndUpdate({ key: req.params.key }, { $set: update }, { new: true, upsert: true }));
  });
  return { pub, admin };
}
