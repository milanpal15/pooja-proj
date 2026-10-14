import { asyncRouter } from '../../lib/async-handler.js';
import { ctx } from '../../lib/context.js';
import { requireDevotee } from '../../lib/perms.js';
import * as svc from './chadhava.service.js';

/**
 * e-Chadhava ORDERS, paid in coins (docs/POOJA_AND_HOME.md section 4). The listings, categories and the old catalogue are catalog's.
 *   public  POST /chadhava                                   -> 410 (the free-amount chadhava is gone; old app builds get a clear answer)
 *   devotee POST /chadhava/orders | GET /chadhava/orders | POST /chadhava/orders/:id/cancel
 *   admin   GET /admin/chadhava-orders | PUT /admin/chadhava-orders/:id/status     (area `orders`)
 */
export function chadhavaRouters() {
  const pub = asyncRouter();
  const devotee = asyncRouter();
  const admin = asyncRouter();

  pub.post('/chadhava', (_req, res) => res.status(410).json({ error: 'This chadhava is no longer offered. Please update the app.', code: 'gone' }));

  devotee.post('/chadhava/orders', requireDevotee, async (req, res) => {
    const out = await svc.placeOrder(req.token.uid, req.body);
    res.status(out.created ? 201 : 200).json({ order: out.order, balance: out.balance });
  });
  devotee.get('/chadhava/orders', requireDevotee, async (req, res) => res.json({ orders: await svc.listForDevotee(req.token.uid) }));
  devotee.post('/chadhava/orders/:id/cancel', requireDevotee, async (req, res) => res.json(await svc.cancelOrder(req.token.uid, req.params.id)));

  admin.get('/admin/chadhava-orders', async (req, res) => res.json({ orders: ctx.redact.redactWho(await svc.listOrdersForAdmin(req.query.limit), req) }));
  admin.put('/admin/chadhava-orders/:id/status', async (req, res) => res.json({ order: await svc.markOffered(req.params.id, req.body?.status) }));

  return { public: pub, devotee, admin };
}
