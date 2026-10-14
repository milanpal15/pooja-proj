import http from 'node:http';

import { verifyServiceToken } from '@bhakti/common';

/**
 * A stand-in for the wallet SERVICE, for this service's tests only (never imported by product code). It keeps a real in-memory ledger that
 * honours the idempotency keys the way the service does (the same key answers with the first result; a failed debit is reopened by a later
 * top-up), the phase-5 refund rules (a refund must name a posted debit of the same uid, once, not above the charge), and it can fail the ways a
 * network does:
 *
 *   up        normal
 *   down      the connection is dropped BEFORE the request is processed (the request never arrived)
 *   lost      the request IS processed and then the connection is dropped (the LOST ANSWER: the one that loses money if mishandled)
 *   broken    500          forbidden   401 (a token mismatch)        hang   never answers (the client's timeout)
 *   slow      processed, but the answer is held until `stub.release()` (a frozen wallet that thaws)
 *
 * `mode` may be a string or a function (path, method) => mode, so a test can break only the debit and let the lookups through.
 */
export async function startWalletStub({ secret, issuers = ['calls'] } = {}) {
  const stub = {
    mode: 'up',
    balances: new Map(),
    txns: new Map(), // idempotency key -> row
    hits: [],
    seq: 0,
    held: [],
    onRequest: null,
  };
  const modeFor = (path, method) => (typeof stub.mode === 'function' ? stub.mode(path, method) : stub.mode);
  const bal = (uid) => stub.balances.get(uid) ?? 0;
  const view = (t) => ({ id: t.id, uid: t.uid, type: t.type, amount: t.amount, status: t.status, balanceAfter: t.balanceAfter ?? null, refType: t.refType ?? null, refId: t.refId ?? null, idempotencyKey: t.idempotencyKey, failReason: t.failReason ?? null });

  function move({ uid, amount, key, type, refType, refId, note, sign, ofKey, reason }) {
    if (!Number.isInteger(amount) || amount <= 0) return [400, { error: 'Amount must be a positive whole number of coins.', code: 'bad_amount' }];
    // The wallet's one remaining exemption: a goodwill refund the MONOLITH queued (key call:<id>:goodwill:<rid>), re-sent by the calls service with the operator's reason.
    const legacyGoodwill = !ofKey && typeof reason === 'string' && reason.trim() && refType === 'call' && /^call:[^:]+:goodwill:/.test(key);
    if (sign > 0 && type === 'refund' && !legacyGoodwill) {
      if (!ofKey) return [400, { error: 'A refund must name the spend it reverses (ofKey).', code: 'ofkey_required' }];
      const d = stub.txns.get(ofKey);
      if (!d) return [409, { error: 'There is no such charge to refund.', code: 'refund_no_debit' }];
      if (d.uid !== uid) return [409, { error: 'That charge belongs to another account.', code: 'refund_wrong_account' }];
      if (d.status !== 'posted') return [409, { error: 'not posted', code: 'refund_debit_not_posted' }];
      if (amount > -d.amount) return [400, { error: 'A refund cannot be more than the charge.', code: 'refund_exceeds_debit' }];
      const prior = [...stub.txns.values()].find((t) => t.ofKey === ofKey && t.idempotencyKey !== key);
      if (prior) return [409, { error: 'That charge has already been refunded.', code: 'already_refunded' }];
    }
    let t = stub.txns.get(key);
    if (t && t.uid !== uid) return [409, { error: 'That request id belongs to another account.', code: 'key_reused' }];
    if (t?.status === 'posted') return [200, { ok: true, txn: view(t), balance: t.balanceAfter, duplicate: true }];
    if (!t) {
      t = { id: String(++stub.seq).padStart(24, '0'), uid, type, amount: sign * amount, refType, refId, note, idempotencyKey: key, status: 'pending', ofKey, ...(legacyGoodwill ? { legacy: true } : {}) };
      stub.txns.set(key, t);
    }
    if (sign < 0 && bal(uid) < amount) {
      t.status = 'failed';
      t.failReason = 'insufficient_coins';
      return [402, { error: 'Not enough coins.', code: 'insufficient_coins', needed: amount, balance: bal(uid), shortfall: Math.max(amount - bal(uid), 0), type }];
    }
    stub.balances.set(uid, bal(uid) + sign * amount);
    t.status = 'posted';
    t.balanceAfter = bal(uid);
    return [200, { ok: true, txn: view(t), balance: t.balanceAfter, duplicate: false }];
  }

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const u = new URL(req.url, 'http://x');
      const path = u.pathname.replace('/internal/wallet', '');
      const body = raw ? JSON.parse(raw) : {};
      const json = (code, b) => { if (!res.destroyed) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); } };
      const claims = verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret, issuers });
      stub.hits.push({ method: req.method, path, query: Object.fromEntries(u.searchParams), body, iss: claims?.iss ?? null });
      await stub.onRequest?.(path, req.method, body); // a test may look at the world the instant a request arrives, before it is processed
      const mode = modeFor(path, req.method);
      if (mode === 'hang') return;
      if (mode === 'down') return req.socket.destroy();
      if (mode === 'broken') return json(500, { error: 'boom', code: 'internal' });
      if (mode === 'forbidden' || !claims) return json(401, { error: 'no', code: 'bad_signature' });
      let answer;
      if (req.method === 'POST' && path === '/debit') answer = move({ ...body, sign: -1 });
      else if (req.method === 'POST' && path === '/refund') answer = move({ ...body, type: 'refund', sign: +1 });
      else if (req.method === 'POST' && path === '/credit') answer = move({ ...body, sign: +1 });
      else if (req.method === 'GET' && path === '/txn') {
        const t = stub.txns.get(u.searchParams.get('key'));
        answer = t && u.searchParams.get('uid') && t.uid !== u.searchParams.get('uid') ? [409, { error: 'nope', code: 'key_reused' }] : [200, { txn: t ? view(t) : null }];
      } else if (req.method === 'GET' && /^\/balance\//.test(path)) answer = [200, { balance: bal(decodeURIComponent(path.split('/')[2])) }];
      else answer = [404, { error: 'not found', code: 'not_found' }];
      if (mode === 'lost') return req.socket.destroy(); // processed above; the answer never leaves
      if (mode === 'slow') { stub.held.push(() => json(...answer)); return; }
      json(...answer);
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  stub.url = `http://127.0.0.1:${server.address().port}`;
  stub.fund = (uid, n) => { stub.balances.set(uid, bal(uid) + n); };
  stub.balance = bal;
  stub.postedFor = (prefix) => [...stub.txns.values()].filter((t) => t.status === 'posted' && t.idempotencyKey.startsWith(prefix));
  stub.release = () => { for (const f of stub.held.splice(0)) f(); };
  stub.close = () => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
  return stub;
}
