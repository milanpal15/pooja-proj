import { redactWho } from '../../access/redact.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { CoinPack } from './coins.model.js';
import * as svc from './coins.service.js';
import { billingRulesRoutes } from './billing-rules.routes.js';

/**
 * Coin packs, purchases and the Razorpay webhook. See docs/COINS_AND_ASTROLOGERS.md §1.
 *
 * The webhook lives in `public` because Razorpay has no session and no token —
 * its only credential is the HMAC over the raw body. It reads `req.rawBody`,
 * which `index.js` captures in `express.json({ verify })` for `/api/webhooks/*`
 * only: re-serialising the parsed JSON would not reproduce the signed bytes.
 */
export function coinsRouters({ requireAuth }) {
  const pub = asyncRouter();
  const devotee = asyncRouter();
  const admin = asyncRouter();

  pub.get('/coins/packs', async (_req, res) => res.json(await svc.listPublicPacks()));

  pub.post('/webhooks/razorpay', async (req, res) => {
    const out = await svc.handleWebhook({
      rawBody: req.rawBody,
      signature: req.get('x-razorpay-signature'),
      event: req.body,
    });
    res.json(out);
  });

  devotee.post('/wallet/orders', requireAuth, async (req, res) => {
    res.json(await svc.createOrder({ uid: req.token.uid, packId: req.body?.packId }));
  });

  devotee.post('/wallet/orders/:orderId/verify', requireAuth, async (req, res) => {
    res.json(await svc.verifyOrder({ uid: req.token.uid, orderId: req.params.orderId, body: req.body }));
  });

  /* ------------------------------------------------------------ admin -- */
  admin.get('/admin/coin-packs', async (_req, res) => {
    const cpr = await svc.getCoinsPerRupee();
    const rows = await CoinPack.find().sort({ order: 1, price: 1 }).lean();
    res.json(rows.map((p) => svc.packView(p, cpr)));
  });

  admin.post('/admin/coin-packs', async (req, res) => {
    const data = await svc.cleanPack(req.body);
    const doc = await CoinPack.create(data);
    res.status(201).json(svc.packView(doc.toObject(), await svc.getCoinsPerRupee()));
  });

  admin.put('/admin/coin-packs/:id', async (req, res) => {
    const existing = /^[0-9a-f]{24}$/i.test(req.params.id) ? await CoinPack.findById(req.params.id).lean() : null;
    if (!existing) throw new HttpError(404, 'pack_not_found', 'Coin pack not found.');
    const data = await svc.cleanPack(req.body, existing);
    const doc = await CoinPack.findByIdAndUpdate(existing._id, { $set: data }, { new: true }).lean();
    res.json(svc.packView(doc, await svc.getCoinsPerRupee()));
  });

  admin.delete('/admin/coin-packs/:id', async (req, res) => {
    // Orders keep their own snapshot, so deleting a pack never rewrites history.
    if (/^[0-9a-f]{24}$/i.test(req.params.id)) await CoinPack.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  admin.get('/admin/coin-orders', async (req, res) => res.json({ orders: redactWho(await svc.listOrders(req.query.limit), req) }));
  admin.get('/admin/coin-stats', async (req, res) => res.json(await svc.stats(req.query.days)));

  billingRulesRoutes(admin);

  pub.use(httpErrorHandler);
  devotee.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { public: pub, devotee, admin };
}
