import { signServiceToken } from '@bhakti/common';

/**
 * The events service's window onto the wallet: ONE operation, a coin credit (type `bonus`, key prefixed `event-`; the wallet refuses
 * anything else from this caller). A money client, so it fails closed: a timeout, a refused connection, a 5xx, an unreadable answer or
 * a token the wallet rejects all throw `WalletUnavailable` - never success, never swallowed. The idempotency key makes a retry (or an
 * answer lost on the wire) safe: the wallet answers the first result and moves the coins once.
 */
export class WalletUnavailable extends Error {
  constructor(reason, { permanent = false, code = '' } = {}) {
    super(`wallet_unavailable: ${reason}`);
    this.name = 'WalletUnavailable';
    this.reason = reason;
    this.permanent = permanent;
    this.code = code;
  }
}

export function createWalletClient(config, { fetchImpl } = {}) {
  const doFetch = fetchImpl ?? ((...a) => fetch(...a));

  return {
    /** Credit coins. Resolves `{ balance, duplicate }` once the wallet has POSTED the credit (first time or replay). */
    async credit({ uid, amount, key, refId, note }) {
      if (!config.walletUrl) throw new WalletUnavailable('WALLET_URL is not set');
      const token = signServiceToken({ iss: 'events', sub: null }, { secret: config.secret });
      let res;
      let text;
      try {
        res = await doFetch(`${config.walletUrl}/internal/wallet/credit`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ uid, amount, type: 'bonus', key, refType: 'event', refId: refId === undefined ? undefined : String(refId), note }),
          signal: AbortSignal.timeout(config.serviceTimeoutMs),
        });
        text = await res.text();
      } catch (e) {
        throw new WalletUnavailable(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : e?.cause?.code || e?.message || 'network');
      }
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (res.ok) {
        if (!data || typeof data !== 'object' || data.ok !== true) throw new WalletUnavailable('unreadable answer');
        return { balance: data.balance, duplicate: !!data.duplicate };
      }
      if (res.status === 401 || (res.status === 403 && data?.code === 'wrong_issuer')) throw new WalletUnavailable(`wallet refused this service's token (${res.status})`);
      if (res.status >= 500 || !data || typeof data.code !== 'string') throw new WalletUnavailable(`status ${res.status}`);
      // A business refusal (400 bad_amount, 403 key not allowed ...): retrying the same request cannot succeed, so say so - the sweeper
      // keeps it pending (visible to an operator) but slows down.
      throw new WalletUnavailable(`${res.status} ${data.code}`, { permanent: true, code: data.code });
    },
  };
}
