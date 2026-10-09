import crypto from 'node:crypto';

import { HttpError } from '../../lib/http-error.js';

/**
 * Which payment provider is live, decided from the environment on every call
 * (so a test can flip it, and a restart is never needed to read a new key).
 *
 *   PAYMENTS_PROVIDER=razorpay|mock   explicit choice
 *   unset                             razorpay if both keys are set, else mock
 *                                     — but never mock in production
 *
 * Returns null when nothing may take money; callers answer 503.
 *
 * `mock` completes a purchase with no money moving. It exists so development
 * and tests can run the whole flow, and it is REFUSED in production even when
 * asked for by name: a mock that works there is free coins for everyone.
 */
export function activeProvider(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  const hasKeys = !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const want = (env.PAYMENTS_PROVIDER || '').toLowerCase();
  if (want === 'mock') return prod ? null : 'mock';
  if (want === 'razorpay') return hasKeys ? 'razorpay' : null;
  if (hasKeys) return 'razorpay';
  return prod ? null : 'mock';
}

export function requireProvider() {
  const p = activeProvider();
  if (!p) throw new HttpError(503, 'payments_unavailable', 'Buying coins is not available right now.');
  return p;
}

/** Create the order on Razorpay's side. Plain fetch + Basic auth — no SDK. */
export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = process.env;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) {
    console.error('✗ Razorpay order failed:', res.status, body?.error?.description || '');
    throw new HttpError(502, 'payments_failed', 'Could not start the payment. Please try again.');
  }
  return { razorpayOrderId: body.id, keyId: id };
}

const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

/** Constant-time string compare; unequal lengths are simply false. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout signature: HMAC-SHA256(`order_id|payment_id`, key secret). */
export function checkoutSignatureOk({ razorpayOrderId, razorpayPaymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !razorpayOrderId || !razorpayPaymentId || !signature) return false;
  return safeEqual(hmacHex(secret, `${razorpayOrderId}|${razorpayPaymentId}`), signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). Must be the RAW bytes. */
export function webhookSignatureOk(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}

export const signForTest = { checkout: (secret, o, p) => hmacHex(secret, `${o}|${p}`), webhook: hmacHex };
