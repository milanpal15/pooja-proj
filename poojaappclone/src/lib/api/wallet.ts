import { authedFetch, publicFetch } from './client';

export type WalletTxnType =
  | 'recharge'
  | 'bonus'
  | 'booking_debit'
  | 'chadhava_debit'
  | 'call_debit'
  | 'refund'
  | 'adjustment';

export type WalletTxn = {
  id: string;
  type: WalletTxnType;
  /** Signed: credits positive, debits negative. */
  amount: number;
  balanceAfter: number;
  refType?: string;
  note?: string;
  /** ISO timestamp. */
  at: string;
};

export async function fetchWallet(): Promise<number> {
  const { balance } = (await authedFetch('/api/wallet')) as { balance: number };
  return balance;
}

export async function fetchTransactions(): Promise<WalletTxn[]> {
  const { transactions } = (await authedFetch('/api/wallet/transactions')) as {
    transactions: WalletTxn[];
  };
  return transactions ?? [];
}

export type CoinPack = {
  id: string;
  coins: number;
  /** Whole rupees. */
  price: number;
  baseCoins: number;
  extraCoins: number;
  /** The "{n}% EXTRA" label; only shown when `onSale`. */
  salePct: number;
  onSale: boolean;
  order: number;
};

export async function fetchCoinPacks(): Promise<{ coinsPerRupee: number; packs: CoinPack[] }> {
  const res = await publicFetch<{ coinsPerRupee?: number; packs?: CoinPack[] }>('/api/coins/packs');
  return { coinsPerRupee: res.coinsPerRupee ?? 1, packs: res.packs ?? [] };
}

export type CoinOrder = {
  orderId: string;
  provider: 'razorpay' | 'mock';
  razorpayOrderId?: string;
  keyId?: string;
  amountPaise: number;
  currency: 'INR';
  coins: number;
  price: number;
};

export function createCoinOrder(packId: string) {
  return authedFetch('/api/wallet/orders', {
    method: 'POST',
    body: JSON.stringify({ packId }),
  }) as Promise<CoinOrder>;
}

export type VerifyBody =
  | { mock: true }
  | { razorpayPaymentId: string; razorpaySignature: string };

export function verifyCoinOrder(orderId: string, body: VerifyBody) {
  return authedFetch(`/api/wallet/orders/${encodeURIComponent(orderId)}/verify`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<{ ok: boolean; balance: number; coinsAdded: number }>;
}
