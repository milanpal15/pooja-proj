import { signServiceToken } from '@bhakti/common';

import { HttpError } from './http-error.js';

/**
 * The orders service's window onto the wallet service. THIS IS A MONEY CLIENT (port of the monolith's lib/wallet-client.js), so its rules are
 * the opposite of the display-only clients':
 *
 *   - FAIL CLOSED. A timeout, a refused connection, a 5xx, an answer that is not JSON, or a service token the wallet rejects are ALL
 *     `HttpError(503, 'wallet_unavailable')`: never treated as success, never as "no coins", never swallowed.
 *   - AMBIGUOUS. For a debit/refund the caller cannot tell "never arrived" from "arrived and the answer was lost", so such an error carries
 *     `ambiguous: true`. The ONLY safe responses are: ask again with the SAME idempotency key, or look the key up (`txnByKey`). This client
 *     never retries on its own and never invents a new key.
 *   - NO CACHE. A balance or a debit is asked for every time.
 *   - A BUSINESS answer (402 insufficient_coins with its shortfall, 400, 409 key_reused / refund_* ...) is rethrown as the same `HttpError`
 *     the wallet sent, so every caller's `e.code === 'insufficient_coins'` logic reads exactly as it did in the monolith.
 *
 * Signed `iss orders`. The wallet's ledger API accepts monolith, pooja-api, orders and calls.
 */
const need = (args, ...names) => {
  for (const n of names) if (args[n] === undefined || args[n] === null || args[n] === '') throw new HttpError(400, n === 'idempotencyKey' ? 'no_key' : 'bad_request', `${n} is required.`);
};

export function createWalletClient(config, { fetchImpl, logger } = {}) {
  const doFetch = fetchImpl ?? ((...a) => fetch(...a));
  let warnedAt = 0;

  const isUnavailable = (e) => e instanceof HttpError && e.code === 'wallet_unavailable';

  function unavailable(why) {
    if (Date.now() - warnedAt > 10_000) {
      warnedAt = Date.now();
      logger?.error(`wallet service unavailable (${why}) - refusing, nothing was assumed`);
    }
    const e = new HttpError(503, 'wallet_unavailable', 'Coins are temporarily unavailable. Please try again in a moment.');
    e.ambiguous = true;
    return e;
  }

  /** One signed call. Resolves with the JSON body of a 2xx; throws `wallet_unavailable` or the wallet's own business error. */
  async function call(method, path, { body, query, uid } = {}) {
    const token = signServiceToken({ iss: 'orders', sub: uid ?? null }, { secret: config.secret });
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    let res;
    let text;
    try {
      res = await doFetch(`${config.walletUrl}/internal/wallet${path}${qs}`, {
        method,
        headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(config.walletTimeoutMs),
      });
      text = await res.text();
    } catch (e) {
      throw unavailable(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : e?.cause?.code || e?.message || 'network');
    }
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (res.ok) {
      if (data === null || typeof data !== 'object') throw unavailable('unreadable answer');
      return data;
    }
    // The wallet refused OUR token (secret mismatch / wrong issuer): a deployment fault, never a business answer.
    if (res.status === 401 || (res.status === 403 && data?.code === 'wrong_issuer')) throw unavailable(`wallet refused this service's token (${res.status})`);
    if (res.status >= 500 || !data || typeof data.code !== 'string') throw unavailable(`status ${res.status}`);
    const { error, code, ...extra } = data;
    throw new HttpError(res.status, code, error, extra);
  }

  /** What the wallet answered, rebuilt as `{ txn: { _id }, balance, duplicate }` - `_id` is the string id. */
  const shape = (d) => ({ txn: d.txn ? { ...d.txn, _id: d.txn.id } : null, balance: d.balance, duplicate: !!d.duplicate });

  return {
    isUnavailable,
    call,

    /** Spend coins. 402 `insufficient_coins` (+ `shortfall`) when short; `wallet_unavailable` (ambiguous) when the answer is unknown. */
    async debit({ uid, amount, type, refType, refId, idempotencyKey, note }) {
      need({ uid, idempotencyKey }, 'uid', 'idempotencyKey');
      return shape(await call('POST', '/debit', { uid, body: { uid, amount, type, key: idempotencyKey, refType, refId: refId === undefined ? undefined : String(refId), note } }));
    },

    /**
     * Return coins for ONE charge. `ofKey` is the idempotency key of the debit being reversed: the wallet verifies that debit exists, is this
     * uid's, is posted, was not refunded already and is at least this large, and rejects the refund otherwise. Required - the orders service
     * has no goodwill path.
     */
    async refund({ uid, amount, refType, refId, idempotencyKey, ofKey, note, createdBy }) {
      need({ uid, idempotencyKey, ofKey }, 'uid', 'idempotencyKey', 'ofKey');
      return shape(await call('POST', '/refund', { uid, body: { uid, amount, key: idempotencyKey, ofKey, refType, refId: refId === undefined ? undefined : String(refId), note, createdBy } }));
    },

    /** The balance, asked fresh every time. Throws `wallet_unavailable`. */
    async getBalance(uid) {
      need({ uid }, 'uid');
      const d = await call('GET', `/balance/${encodeURIComponent(uid)}`, { uid });
      if (typeof d.balance !== 'number') throw unavailable('unreadable balance');
      return d.balance;
    },

    /** For a balance that is only SHOWN: the number, or undefined when the wallet cannot say (never a made-up 0). */
    async balanceOrUndefined(uid) {
      try {
        return await this.getBalance(uid);
      } catch (e) {
        if (isUnavailable(e)) return undefined;
        throw e;
      }
    },

    /** What happened to this idempotency key: the ledger row (`status` posted | failed | pending) or null when the wallet never saw it. */
    async txnByKey(key, uid) {
      need({ key }, 'key');
      const d = await call('GET', '/txn', { query: { key, ...(uid ? { uid } : {}) }, uid });
      return d.txn ? { ...d.txn, _id: d.txn.id } : null;
    },
  };
}
