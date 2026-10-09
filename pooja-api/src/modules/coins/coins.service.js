import { HttpError } from '../../lib/http-error.js';
import { describePack, packProblem } from '../../lib/coin-pack.js';
import { getNumberSetting } from '../../lib/settings.js';
import { User } from '../../models.js';
import { Wallet, WalletTxn } from '../wallet/wallet.model.js';
import * as wallet from '../wallet/wallet.service.js';
import { CoinOrder, CoinPack } from './coins.model.js';
import * as providers from './providers.js';

export const getCoinsPerRupee = () => getNumberSetting('coinsPerRupee', 1);

/** A pack as clients see it: the stored fields plus everything derived. */
export function packView(p, coinsPerRupee) {
  const d = describePack({ coins: p.coins, price: p.price, coinsPerRupee, showSale: p.showSale, saleEndsAt: p.saleEndsAt });
  return {
    id: String(p._id),
    coins: p.coins,
    price: p.price,
    baseCoins: d.baseCoins,
    extraCoins: d.extraCoins,
    salePct: d.salePct,
    discountPct: d.discountPct,
    costPerCoin: d.costPerCoin,
    onSale: d.onSale,
    showSale: !!p.showSale,
    saleEndsAt: p.saleEndsAt ?? null,
    order: p.order ?? 0,
    active: p.active !== false,
  };
}

const PACK_FIELDS = ['coins', 'price', 'showSale', 'saleEndsAt', 'order', 'active'];

/** Whitelist + validate a pack body. Throws 400 `bad_pack`. */
export async function cleanPack(body, base = {}) {
  const merged = { ...base };
  for (const k of PACK_FIELDS) if (body?.[k] !== undefined) merged[k] = body[k];
  const problem = packProblem({ coins: merged.coins, price: merged.price, coinsPerRupee: await getCoinsPerRupee() });
  if (problem) throw new HttpError(400, 'bad_pack', problem);
  if (merged.saleEndsAt === '' || merged.saleEndsAt === null) merged.saleEndsAt = undefined;
  if (merged.saleEndsAt !== undefined && Number.isNaN(new Date(merged.saleEndsAt).getTime())) {
    throw new HttpError(400, 'bad_pack', 'The sale end date is not a valid date.');
  }
  return merged;
}

export async function listPublicPacks() {
  const [cpr, rows] = await Promise.all([getCoinsPerRupee(), CoinPack.find({ active: true }).sort({ order: 1, price: 1 }).lean()]);
  return { coinsPerRupee: cpr, packs: rows.map((p) => packView(p, cpr)) };
}

/** Start a purchase. Price and coins are read from the pack HERE and frozen onto the order. */
export async function createOrder({ uid, packId }) {
  const provider = providers.requireProvider();
  const pack = packId && /^[0-9a-f]{24}$/i.test(String(packId)) ? await CoinPack.findOne({ _id: packId, active: true }).lean() : null;
  if (!pack) throw new HttpError(404, 'pack_not_found', 'That coin pack is not available.');

  const order = await CoinOrder.create({
    uid,
    packId: pack._id,
    coins: pack.coins,
    price: pack.price,
    amountPaise: Math.round(pack.price * 100),
    provider,
  });

  let extra = {};
  if (provider === 'razorpay') {
    try {
      const rz = await providers.createRazorpayOrder({
        amountPaise: order.amountPaise,
        receipt: String(order._id),
        notes: { orderId: String(order._id), uid },
      });
      order.razorpayOrderId = rz.razorpayOrderId;
      await order.save();
      extra = { razorpayOrderId: rz.razorpayOrderId, keyId: rz.keyId };
    } catch (e) {
      await CoinOrder.updateOne({ _id: order._id }, { $set: { status: 'failed' } });
      throw e;
    }
  }
  return { orderId: String(order._id), provider, ...extra, amountPaise: order.amountPaise, currency: 'INR', coins: order.coins, price: order.price };
}

/**
 * Turn a paid order into coins — exactly once, however many callers arrive.
 *
 * The browser's verify call, the Razorpay webhook and a retry can all land for
 * the same payment, in any order. The wallet's idempotency key (`order:<id>`)
 * is what makes the second and third a no-op; this function never decides
 * "have I credited?" from the order's own status, which would race.
 * Coins come from the order's snapshot, never from the pack as it is now.
 */
export async function creditOrder(orderId, { paymentId } = {}) {
  const order = await CoinOrder.findById(orderId);
  if (!order) throw new HttpError(404, 'order_not_found', 'Order not found.');
  const out = await wallet.credit({
    uid: order.uid,
    amount: order.coins,
    type: 'recharge',
    refType: 'order',
    refId: String(order._id),
    idempotencyKey: `order:${order._id}`,
    note: `Bought ${order.coins} coins`,
  });
  await CoinOrder.updateOne(
    { _id: order._id },
    {
      $set: {
        status: 'paid',
        walletTxnId: String(out.txn._id),
        ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
      },
      $min: { paidAt: new Date() },
    },
  );
  // $min on an unset field sets it; later calls keep the earliest time.
  return { balance: out.balance, coinsAdded: order.coins, duplicate: !!out.duplicate };
}

/** The devotee's own call back from the payment sheet. */
export async function verifyOrder({ uid, orderId, body }) {
  const order = /^[0-9a-f]{24}$/i.test(String(orderId)) ? await CoinOrder.findOne({ _id: orderId, uid }) : null;
  if (!order) throw new HttpError(404, 'order_not_found', 'Order not found.');

  if (order.provider === 'mock') {
    if (!providers.activeProvider() || providers.activeProvider() !== 'mock') {
      throw new HttpError(503, 'payments_unavailable', 'Buying coins is not available right now.');
    }
    if (body?.mock !== true) throw new HttpError(400, 'bad_signature', 'Payment could not be verified.');
    const r = await creditOrder(order._id);
    return { ok: true, balance: r.balance, coinsAdded: r.coinsAdded };
  }

  const { razorpayPaymentId, razorpaySignature } = body ?? {};
  const good = providers.checkoutSignatureOk({
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId,
    signature: razorpaySignature,
  });
  if (!good) throw new HttpError(400, 'bad_signature', 'Payment could not be verified.');
  const r = await creditOrder(order._id, { paymentId: razorpayPaymentId });
  return { ok: true, balance: r.balance, coinsAdded: r.coinsAdded };
}

/** Razorpay's server-to-server notice, for when the app never got to call verify. */
export async function handleWebhook({ rawBody, signature, event }) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) throw new HttpError(503, 'webhook_unconfigured', 'Webhook secret is not set.');
  if (!providers.webhookSignatureOk(rawBody, signature)) throw new HttpError(400, 'bad_signature', 'Bad signature.');

  const type = event?.event;
  if (type !== 'payment.captured' && type !== 'order.paid') return { ok: true, ignored: true };
  const payment = event?.payload?.payment?.entity;
  const rzOrderId = payment?.order_id || event?.payload?.order?.entity?.id;
  const order = rzOrderId ? await CoinOrder.findOne({ razorpayOrderId: rzOrderId }) : null;
  // Unknown order: acknowledge, or Razorpay retries it for days.
  if (!order) return { ok: true, ignored: true };
  // Never credit more than was sold: the paid amount must match our snapshot.
  if (payment?.amount !== undefined && payment.amount !== order.amountPaise) {
    console.error(`✗ Razorpay amount mismatch on order ${order._id}: paid ${payment.amount}, expected ${order.amountPaise}`);
    return { ok: true, ignored: true };
  }
  const r = await creditOrder(order._id, { paymentId: payment?.id });
  return { ok: true, credited: !r.duplicate };
}

export async function listOrders(limit = 50) {
  const rows = await CoinOrder.find().sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
  const users = await User.find({ uid: { $in: [...new Set(rows.map((r) => r.uid))] } }).select('uid name contact').lean();
  const who = new Map(users.map((u) => [u.uid, u.name || u.contact]));
  return rows.map((o) => ({
    id: String(o._id), uid: o.uid, who: who.get(o.uid) || o.uid, coins: o.coins, price: o.price,
    status: o.status, provider: o.provider, at: o.createdAt,
  }));
}

export async function stats(days = 30) {
  const since = new Date(Date.now() - Math.max(1, Number(days) || 30) * 86_400_000);
  const [sales, spent, held] = await Promise.all([
    CoinOrder.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: since }, provider: 'razorpay' } },
      { $group: { _id: null, paise: { $sum: '$amountPaise' }, coins: { $sum: '$coins' } } },
    ]),
    WalletTxn.aggregate([
      { $match: { status: 'posted', createdAt: { $gte: since }, type: { $in: ['booking_debit', 'chadhava_debit', 'call_debit'] } } },
      { $group: { _id: '$type', coins: { $sum: { $multiply: ['$amount', -1] } } } },
    ]),
    Wallet.aggregate([{ $group: { _id: null, coins: { $sum: '$balance' } } }]),
  ]);
  const by = Object.fromEntries(spent.map((s) => [s._id, s.coins]));
  return {
    salesPaise: sales[0]?.paise ?? 0,
    coinsSold: sales[0]?.coins ?? 0,
    coinsSpent: { booking: by.booking_debit ?? 0, chadhava: by.chadhava_debit ?? 0, call: by.call_debit ?? 0 },
    unspentCoins: held[0]?.coins ?? 0,
  };
}
