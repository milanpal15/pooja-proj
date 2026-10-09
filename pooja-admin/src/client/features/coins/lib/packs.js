import { isoToDayKey } from '../../../lib/dates.js';
import { describePack, packProblem } from './coin-pack.js';

/** "50% EXTRA" when the pack is on sale, else null. */
export const saleLabel = (d) => (d.onSale ? `${d.salePct}% EXTRA` : null);

/** A pack row plus everything derived from it, for the table. */
export function derive(pack, coinsPerRupee) {
  return describePack({ ...pack, coinsPerRupee });
}

/** The form state for a new pack, one step after the last in the list. */
export const blankForm = (nextOrder = 1) => ({
  coins: '',
  price: '',
  showSale: true,
  saleEndsAt: '',
  order: String(nextOrder),
  active: true,
});

export const packToForm = (p) => ({
  coins: String(p.coins ?? ''),
  price: String(p.price ?? ''),
  showSale: p.showSale !== false,
  saleEndsAt: isoToDayKey(p.saleEndsAt),
  order: String(p.order ?? 1),
  active: p.active !== false,
});

/** Why the form cannot be saved, or null. Mirrors what the API will say (bad_pack). */
export function formProblem(form, coinsPerRupee) {
  if (!/^\d+$/.test(String(form.coins).trim()) || !/^\d+$/.test(String(form.price).trim())) {
    return 'Coins and price must be positive whole numbers.';
  }
  const problem = packProblem({ coins: Number(form.coins), price: Number(form.price), coinsPerRupee });
  if (problem) return problem;
  if (form.order !== '' && !/^\d+$/.test(String(form.order).trim())) {
    return 'Position in the list must be a whole number.';
  }
  return null;
}

/** Form -> the body POST/PUT /api/admin/coin-packs expects. */
export function formToBody(form) {
  let saleEndsAt = null;
  if (form.saleEndsAt) {
    const [y, m, d] = form.saleEndsAt.split('-').map(Number);
    // The sale runs through the end of the chosen day, local time.
    saleEndsAt = new Date(y, m - 1, d, 23, 59, 59).toISOString();
  }
  return {
    coins: Number(form.coins),
    price: Number(form.price),
    showSale: !!form.showSale,
    saleEndsAt,
    order: form.order === '' ? 1 : Number(form.order),
    active: !!form.active,
  };
}

/** How many paid orders in the last `days` match a pack's coins and price. */
export function soldByPack(packs, orders, days = 30) {
  const since = Date.now() - days * 86400000;
  const out = {};
  for (const o of orders || []) {
    if (o.status && o.status !== 'paid') continue;
    if (o.at && new Date(o.at).getTime() < since) continue;
    const key = `${o.coins}:${o.price}`;
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(packs.map((p) => [p.id ?? p._id, out[`${p.coins}:${p.price}`] || 0]));
}

export const TXN_TYPES = [
  { value: 'recharge', label: 'Recharge', tone: 'success' },
  { value: 'bonus', label: 'Bonus', tone: 'success' },
  { value: 'booking_debit', label: 'Booking', tone: 'danger' },
  { value: 'chadhava_debit', label: 'Chadhava', tone: 'danger' },
  { value: 'call_debit', label: 'Call', tone: 'danger' },
  { value: 'refund', label: 'Refund', tone: 'info' },
  { value: 'adjustment', label: 'Adjustment', tone: 'warning' },
];
export const txnType = (v) => TXN_TYPES.find((t) => t.value === v) || { value: v, label: v, tone: 'neutral' };
