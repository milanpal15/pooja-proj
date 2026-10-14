import { config } from '../config/env.js';
import { HttpError } from './http-error.js';
import { signServiceToken } from './service-jwt.js';

/**
 * The monolith's window onto the wallet service (phase 4 of docs/MICROSERVICES.md). Only used when WALLET_URL is set; with it unset
 * nothing here is called and the monolith moves coins through its own `modules/wallet/wallet.service.js` exactly as before
 * (`lib/wallet-ledger.js` is the one place that chooses).
 *
 * THIS IS A MONEY CLIENT, so the rules are the opposite of the other clients':
 *
 *   - FAIL CLOSED. A timeout, a refused connection, a 5xx, an answer that is not JSON, or a service token the wallet rejects are ALL
 *     `HttpError(503, 'wallet_unavailable')`: never treated as success, never as "no coins", never swallowed.
 *   - AMBIGUOUS. For a debit/refund the caller cannot tell "never arrived" from "arrived and the answer was lost", so such an error
 *     carries `ambiguous: true`. The ONLY safe responses are: ask again with the SAME idempotency key, or look the key up (`txnByKey`).
 *     This client never retries on its own and never invents a new key.
 *   - NO CACHE. A balance or a debit is asked for every time.
 *   - A BUSINESS answer (402 insufficient_coins with its shortfall, 400, 409 key_reused ...) is rethrown as the same `HttpError` the
 *     local wallet service throws, so every caller's existing `e.code === 'insufficient_coins'` logic is unchanged.
 *
 * Signed with iss `monolith`, 5 s timeout, like the other clients.
 */
export const TIMEOUT_MS = 5_000;
let timeoutMs = TIMEOUT_MS;

export const walletEnabled = () => Boolean(config.walletUrl);

let fetchImpl = (...a) => fetch(...a);
let warnedAt = 0;
/** Test hooks. */
export const _setFetch = (f) => { fetchImpl = f ?? ((...a) => fetch(...a)); };
export const _setTimeoutMs = (ms) => { timeoutMs = ms ?? TIMEOUT_MS; };
export const _reset = () => { warnedAt = 0; timeoutMs = TIMEOUT_MS; };

export const isUnavailable = (e) => e instanceof HttpError && e.code === 'wallet_unavailable';

function unavailable(why) {
  if (Date.now() - warnedAt > 10_000) {
    warnedAt = Date.now();
    console.error(`! wallet service unavailable (${why}) - refusing, nothing was assumed`);
  }
  const e = new HttpError(503, 'wallet_unavailable', 'Coins are temporarily unavailable. Please try again in a moment.');
  e.ambiguous = true;
  return e;
}

/** One signed call. Resolves with the JSON body of a 2xx; throws `wallet_unavailable` or the wallet's own business error. */
export async function call(method, path, { body, query, uid } = {}) {
  const token = signServiceToken({ iss: 'monolith', sub: uid ?? null }, { secret: config.internalJwtSecret });
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  let res;
  let text;
  try {
    res = await fetchImpl(`${config.walletUrl}/internal/wallet${path}${qs}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
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
  // The wallet service refused OUR token (secret mismatch / wrong issuer): a deployment fault, never a business answer.
  if (res.status === 401 || (res.status === 403 && data?.code === 'wrong_issuer')) throw unavailable(`wallet refused this service's token (${res.status})`);
  if (res.status >= 500 || !data || typeof data.code !== 'string') throw unavailable(`status ${res.status}`);
  const { error, code, ...extra } = data;
  throw new HttpError(res.status, code, error, extra);
}

/** What `wallet.service` returns, rebuilt from the wire: `txn._id` is the string id, `duplicate` says the key had been used. */
const shape = (d) => ({
  txn: d.txn ? { ...d.txn, _id: d.txn.id } : null,
  balance: d.balance,
  duplicate: !!d.duplicate,
});

const need = (args, ...names) => {
  for (const n of names) if (args[n] === undefined || args[n] === null || args[n] === '') throw new HttpError(400, n === 'idempotencyKey' ? 'no_key' : 'bad_request', `${n} is required.`);
};

/** Spend coins. 402 `insufficient_coins` (+ `shortfall`) when short; `wallet_unavailable` (ambiguous) when the answer is unknown. */
export async function debit({ uid, amount, type, refType, refId, idempotencyKey, note }) {
  need({ uid, idempotencyKey }, 'uid', 'idempotencyKey');
  return shape(await call('POST', '/debit', { uid, body: { uid, amount, type, key: idempotencyKey, refType, refId: refId === undefined ? undefined : String(refId), note } }));
}

/**
 * Return coins for a charge. Idempotent on the key.
 *
 * Phase 5 hardening: the wallet service only honours a refund that names the spend it reverses - `ofKey` is the idempotency key of that DEBIT
 * (`booking:<uid>:<requestId>`, `chadhava:...`, `call:<id>:min:<n>`). The one exemption is an operator's goodwill refund on a call, which has no
 * single debit behind it: it sends an explicit `reason` instead (the wallet accepts that only from the monolith, only for refType `call`).
 */
export async function refund({ uid, amount, refType, refId, idempotencyKey, note, createdBy, ofKey, reason }) {
  need({ uid, idempotencyKey }, 'uid', 'idempotencyKey');
  return shape(await call('POST', '/refund', { uid, body: { uid, amount, key: idempotencyKey, ofKey, reason, refType, refId: refId === undefined ? undefined : String(refId), note, createdBy } }));
}

/** Goodwill credit (`type: 'bonus'` only; purchases are credited by the wallet itself). */
export async function credit({ uid, amount, type = 'bonus', refType, refId, idempotencyKey, note, createdBy }) {
  need({ uid, idempotencyKey }, 'uid', 'idempotencyKey');
  return shape(await call('POST', '/credit', { uid, body: { uid, amount, type, key: idempotencyKey, refType, refId: refId === undefined ? undefined : String(refId), note, createdBy } }));
}

/** The balance, asked fresh every time. Throws `wallet_unavailable` - callers that merely DISPLAY it use `balanceOrUndefined`. */
export async function getBalance(uid) {
  need({ uid }, 'uid');
  const d = await call('GET', `/balance/${encodeURIComponent(uid)}`, { uid });
  if (typeof d.balance !== 'number') throw unavailable('unreadable balance');
  return d.balance;
}

/** For a balance that is only SHOWN: the number, or undefined when the wallet cannot say (never a made-up 0). */
export async function balanceOrUndefined(uid) {
  try {
    return await getBalance(uid);
  } catch (e) {
    if (isUnavailable(e)) return undefined;
    throw e;
  }
}

/**
 * What happened to this idempotency key: the ledger row (`status` posted | failed | pending) or null when the wallet never saw it.
 * The question a sweeper asks after an ambiguous answer. `uid` makes another account's key a 409 instead of an answer.
 */
export async function txnByKey(key, uid) {
  need({ key }, 'key');
  const d = await call('GET', '/txn', { query: { key, ...(uid ? { uid } : {}) }, uid });
  return d.txn ? { ...d.txn, _id: d.txn.id } : null;
}

/** Ask the wallet to finish ledger rows stranded `pending` by a crash. */
export const reconcile = (body = {}) => call('POST', '/reconcile', { body });
