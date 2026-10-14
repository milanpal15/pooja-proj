import { asyncRouter } from '../../lib/async-handler.js';
import { ctx } from '../../lib/context.js';
import { HttpError } from '../../lib/http-error.js';
import { requireDevotee } from '../../lib/perms.js';
import * as wallet from './wallet.service.js';
import { Wallet, WalletTxn } from './wallet.model.js';

/**
 * Wallet endpoints (the monolith's modules/wallet/wallet.routes.js, same paths and bodies).
 *
 *   devotee (mobile BFF, uid = the token's sub):   GET /wallet            -> { balance }
 *                                                  GET /wallet/transactions?limit&before
 *   admin   (admin BFF, operator claims):          GET /admin/wallets?q=
 *                                                  GET /admin/wallet-transactions?type&uid&limit
 *                                                  POST /admin/wallet/adjust   { uid, amount, reason, requestId }
 */
export function walletRouters() {
  const devotee = asyncRouter();
  const admin = asyncRouter();

  devotee.get('/wallet', requireDevotee, async (req, res) => {
    res.json({ balance: await wallet.getBalance(req.token.uid) });
  });

  devotee.get('/wallet/transactions', requireDevotee, async (req, res) => {
    const rows = await wallet.listTransactions(req.token.uid, { limit: req.query.limit, before: req.query.before });
    res.json({
      transactions: rows.map((t) => ({
        id: String(t._id),
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        refType: t.refType,
        note: t.note,
        at: t.createdAt,
      })),
    });
  });

  admin.get('/admin/wallets', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    let users = [];
    if (q) users = await ctx.identity.search(q, { sub: req.operator?.id, role: req.operator?.role, perms: req.operator?.permissions });
    const uids = users.map((u) => u.uid).filter(Boolean);
    const wallets = uids.length ? await Wallet.find({ uid: { $in: uids } }).lean() : [];
    const byUid = new Map(wallets.map((w) => [w.uid, w.balance]));
    res.json({
      wallets: users.filter((u) => u.uid).map((u) => ({ uid: u.uid, name: u.name || '', contact: u.contact, balance: byUid.get(u.uid) ?? 0 })),
    });
  });

  admin.get('/admin/wallet-transactions', async (req, res) => {
    const q = { status: 'posted' };
    if (req.query.type) q.type = String(req.query.type);
    if (req.query.uid) q.uid = String(req.query.uid);
    const rows = await WalletTxn.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 200)).lean();
    const who = await ctx.identity.whoByUid(rows.map((r) => r.uid));
    res.json({
      transactions: ctx.redact.redactWho(rows.map((t) => ({
        id: String(t._id),
        uid: t.uid,
        who: who.get(t.uid) || t.uid,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        refType: t.refType,
        refId: t.refId,
        note: t.note,
        createdBy: t.createdBy,
        at: t.createdAt,
      })), req),
    });
  });

  admin.post('/admin/wallet/adjust', async (req, res) => {
    const { uid, amount, reason, requestId } = req.body ?? {};
    if (!uid) throw new HttpError(400, 'no_user', 'Choose a devotee.');
    const out = await wallet.adjust({ uid, amount, reason, requestId, operator: req.operator?.username });
    res.json({ ok: true, balance: out.balance });
  });

  return { devotee, admin };
}
