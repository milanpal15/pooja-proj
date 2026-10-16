import { asyncRouter } from '../../lib/async-handler.js';
import * as wallet from './wallet.service.js';

/**
 * Read-only, by uid, for the identity service's Users 360 view (docs/USERS.md section 2). /internal/wallet/directory/*, `iss: identity` only (lib/perms.js).
 *
 *   GET /directory/users/:uid  -> { balance, recent:[{ id, type, amount, balanceAfter, refType, at }] }   the 10 newest POSTED movements
 *
 * Deliberately no `note` / `createdBy` (free text an operator typed, which can name someone) and nothing that can move a balance.
 */
export function directoryRoutes() {
  const r = asyncRouter();
  r.get('/directory/users/:uid', async (req, res) => {
    const [balance, rows] = await Promise.all([wallet.getBalance(req.params.uid), wallet.listTransactions(req.params.uid, { limit: 10 })]);
    res.json({
      balance,
      recent: rows.map((t) => ({ id: String(t._id), type: t.type, amount: t.amount, balanceAfter: t.balanceAfter ?? null, refType: t.refType ?? null, at: t.createdAt, createdAt: t.createdAt })),
    });
  });
  return r;
}
