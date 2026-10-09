/**
 * The only file that knows about Razorpay.
 *
 * `react-native-razorpay` is a native module, and adding one means a new
 * build. It is NOT in package.json yet (see docs/PAYMENTS_SETUP.md), so it is
 * loaded lazily behind a guarded `require`: Metro treats a require inside
 * try/catch as optional, the app bundles and runs without it, and the missing
 * module surfaces as a clear "needs a new build" error at the moment someone
 * tries to pay — not as a crash on launch.
 */

import type { CoinOrder, VerifyBody } from '@/lib/api';

export type CheckoutOutcome =
  | { kind: 'paid'; body: VerifyBody }
  | { kind: 'cancelled' };

/** Thrown when the native checkout is not part of this build. */
export class PaymentsUnavailableError extends Error {
  constructor() {
    super('react-native-razorpay is not installed in this build');
    this.name = 'PaymentsUnavailableError';
  }
}

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
};

type RazorpayModule = {
  open: (options: Record<string, unknown>) => Promise<RazorpaySuccess>;
};

function loadNative(): RazorpayModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-razorpay');
    const impl = (mod?.default ?? mod) as RazorpayModule | undefined;
    return impl && typeof impl.open === 'function' ? impl : null;
  } catch {
    return null;
  }
}

export type Prefill = { name?: string; email?: string; contact?: string };

/**
 * Collect the payment for an order.
 *
 *  - `mock` (dev servers only): nothing to collect; verify with `{mock:true}`.
 *    A release build refuses it — a production device should never be talking
 *    to a server that fakes payments, and silently crediting would hide that.
 *  - `razorpay`: open the native sheet. Closing it without paying resolves to
 *    `cancelled` — a choice, not an error.
 */
export async function collectPayment(order: CoinOrder, prefill: Prefill = {}): Promise<CheckoutOutcome> {
  if (order.provider === 'mock') {
    if (!__DEV__) throw new PaymentsUnavailableError();
    return { kind: 'paid', body: { mock: true } };
  }

  const native = loadNative();
  if (!native) throw new PaymentsUnavailableError();
  if (!order.keyId || !order.razorpayOrderId) {
    throw new Error('The server returned an incomplete Razorpay order');
  }

  try {
    const res = await native.open({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'Bhakti',
      description: `${order.coins} coins`,
      prefill,
      theme: { color: '#AF101A' },
    });
    return {
      kind: 'paid',
      body: { razorpayPaymentId: res.razorpay_payment_id, razorpaySignature: res.razorpay_signature },
    };
  } catch (e) {
    // The SDK rejects with { code, description }. Code 0 (Android) / 2 (iOS)
    // is "user closed the sheet"; everything else is a genuine failure.
    const code = (e as { code?: number } | null)?.code;
    if (code === 0 || code === 2) return { kind: 'cancelled' };
    throw e;
  }
}
