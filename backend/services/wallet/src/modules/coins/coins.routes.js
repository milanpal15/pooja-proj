import { asyncRouter } from '../../lib/async-handler.js';
import { ctx } from '../../lib/context.js';
import { HttpError } from '../../lib/http-error.js';
import { requireDevotee } from '../../lib/perms.js';
import { CoinPack } from './coins.model.js';
import * as svc from './coins.service.js';
import { billingRulesRoutes } from './billing-rules.routes.js';

/**
 * Coin packs and purchases (the monolith's modules/coins/coins.routes.js, same paths and bodies). See docs/COINS_AND_ASTROLOGERS.md.
 *
 *   public  (either BFF)    GET /coins/packs
 *   devotee (mobile BFF)    POST /wallet/orders              { packId }
 *                           POST /wallet/orders/:orderId/verify
 *   admin   (admin BFF)     /admin/coin-packs (CRUD), /admin/coin-orders, /admin/coin-stats, /admin/billing/rules
 *
 * The Razorpay webhook is NOT here: it needs the raw bytes, so `app.js` mounts `webhookRoute` before the JSON parser.
 */
export function coinsRouters() {
  const pub = asyncRouter();
  const devotee = asyncRouter();
  const admin = asyncRouter();

  pub.get('/coins/packs', async (_req, res) => res.json(await svc.listPublicPacks()));

  devotee.post('/wallet/orders', requireDevotee, async (req, res) => {
    res.json(await svc.createOrder({ uid: req.token.uid, packId: req.body?.packId }));
  });

  devotee.post('/wallet/orders/:orderId/verify', requireDevotee, async (req, res) => {
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

  admin.get('/admin/coin-orders', async (req, res) => res.json({ orders: ctx.redact.redactWho(await svc.listOrders(req.query.limit), req) }));
  admin.get('/admin/coin-stats', async (req, res) => res.json(await svc.stats(req.query.days)));

  billingRulesRoutes(admin);

  return { public: pub, devotee, admin };
}

/**
 * `POST /webhooks/razorpay` - Razorpay has no session and no token; its only credential is the HMAC over the RAW bytes of the body,
 * which the BFF streamed here untouched and `express.raw` kept as a Buffer. Re-serialising parsed JSON would not reproduce the
 * signed bytes, so the signature is checked on the Buffer FIRST and only then is the body parsed.
 */
export async function webhookRoute(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  svc.verifyWebhook({ rawBody, signature: req.get('x-razorpay-signature') });
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json', 'Invalid JSON.');
  }
  res.json(await svc.handleWebhook({ event }));
}
