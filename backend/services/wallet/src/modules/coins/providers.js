import crypto from 'node:crypto';

import { ctx } from '../../lib/context.js';
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
export function activeProvider(env = ctx.config.payments) {
  const prod = env.nodeEnv === 'production';
  const hasKeys = !!(env.keyId && env.keySecret);
  const want = (env.provider || '').toLowerCase();
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
  const { keyId: id, keySecret: secret } = ctx.config.payments;
  const res = await ctx.fetchImpl('https://api.razorpay.com/v1/orders', {
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
    // The key id is public (the phone receives it), so it is safe to print; for the secret only its length.
    if (res.status === 401) {
      console.error(`  key id "${id}" (${id.startsWith('rzp_test_') ? 'test' : id.startsWith('rzp_live_') ? 'live' : 'unrecognised'} mode), secret length ${secret.length} — a test key id needs the secret generated with it, in the same mode`);
    }
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
  const secret = ctx.config.payments.keySecret;
  if (!secret || !razorpayOrderId || !razorpayPaymentId || !signature) return false;
  return safeEqual(hmacHex(secret, `${razorpayOrderId}|${razorpayPaymentId}`), signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). Must be the RAW bytes. */
export function webhookSignatureOk(rawBody, signature) {
  const secret = ctx.config.payments.webhookSecret;
  if (!secret || !rawBody?.length || !signature) return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}

export const signForTest = { checkout: (secret, o, p) => hmacHex(secret, `${o}|${p}`), webhook: hmacHex };
