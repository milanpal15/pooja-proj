import { RULE_KEYS } from '../modules/coins/billing-rules.routes.js';
import { Setting } from '../models.js';

const MONEY_KEYS = new Set(RULE_KEYS);

/**
 * `/content/settings` is one generic table holding both ordinary settings
 * (support contacts) and the ones that move money (prices, fees, the calls
 * kill switch, payout rate). Area `content` lets an editor write the former;
 * this guard makes the latter need `money:edit`, however the write arrives
 * (create, edit, rename onto a money key, delete).
 */
export async function settingsGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.can?.('money:edit')) return next();

  const touches = [];
  if (req.body?.key !== undefined) touches.push(String(req.body.key));
  const id = req.path.split('/').filter(Boolean)[0];
  if (id) {
    const row = await Setting.findById(id).select('key').lean().catch(() => null);
    if (row) touches.push(row.key);
  }
  if (touches.some((k) => MONEY_KEYS.has(k))) {
    return res.status(403).json({
      error: "You don't have permission for that.",
      code: 'forbidden',
      needs: 'money:edit',
    });
  }
  next();
}
