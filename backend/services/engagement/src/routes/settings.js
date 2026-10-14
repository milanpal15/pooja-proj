import { asyncRouter } from '../lib/async-handler.js';
import { crud } from '../lib/crud.js';
import { HttpError } from '../lib/http-error.js';
import { can, requirePerm } from '../lib/perms.js';
import { MONEY_KEYS } from '../defaults.js';
import { Setting } from '../models/index.js';

const MONEY = new Set(MONEY_KEYS);
const FORBIDDEN = "You don't have permission for that.";

/**
 * `settings` is one generic table holding ordinary settings (support contacts) and the ones that move
 * money. Content editors may write the former; the latter need `money:edit`, however the write arrives
 * (create, edit, rename onto a money key, delete). Same rule as the monolith's access/settings-guard.js,
 * with the permission read from the verified service token instead of the session.
 */
async function settingsGuard(req, _res, next) {
  if (can(req, 'money:edit')) return next();
  const touches = [];
  if (req.body?.key !== undefined) touches.push(String(req.body.key));
  for (const item of Array.isArray(req.body?.items) ? req.body.items : []) touches.push(String(item?.key));
  const id = req.params.id;
  if (id) {
    const row = await Setting.findById(id).select('key').lean().catch(() => null);
    if (row) touches.push(row.key);
  }
  if (touches.some((k) => MONEY.has(k))) throw new HttpError(403, 'forbidden', FORBIDDEN, { needs: 'money:edit' });
  next();
}

const canWrite = requirePerm('content:edit', 'money:edit');

/** Read side (any service) and the monolith's billing-rules write. */
export const settingRoutes = asyncRouter();

settingRoutes.get('/settings', async (_req, res) => res.json(await Setting.find().sort({ key: 1 }).lean()));

/** The flat { key: value } map `GET /api/content` embeds. */
settingRoutes.get('/settings/map', async (_req, res) => {
  const rows = await Setting.find().lean();
  res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

/**
 * Upsert several settings at once (the monolith's billing rules). Creates a missing row with its label/desc
 * and always sets the value, validated by the caller. Items: [{ key, value, label?, desc? }].
 */
settingRoutes.post('/settings/upsert', canWrite, settingsGuard, async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new HttpError(400, 'bad_request', 'items[] required.');
  for (const i of items) if (typeof i?.key !== 'string' || !i.key) throw new HttpError(400, 'bad_request', 'Every item needs a key.');
  for (const i of items) {
    await Setting.updateOne(
      { key: i.key },
      { $setOnInsert: { key: i.key, label: i.label, desc: i.desc }, $set: { value: String(i.value ?? '') } },
      { upsert: true },
    );
  }
  res.json({ ok: true, count: items.length });
});

settingRoutes.get('/settings/:key', async (req, res) => {
  const row = await Setting.findOne({ key: req.params.key }).lean();
  if (!row) return res.status(404).json({ error: 'setting not found', code: 'not_found' });
  res.json(row);
});

/** Dashboard CRUD (the monolith's `/api/content/settings`). */
export const settingAdminRoutes = crud('Setting', Setting, { key: 1 }, { write: [canWrite, settingsGuard] });
