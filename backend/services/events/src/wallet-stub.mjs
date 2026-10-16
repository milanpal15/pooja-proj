import http from 'node:http';

import { verifyServiceToken } from '@bhakti/common';

/**
 * A stand-in for the WALLET SERVICE, for this service's tests only. It keeps a real in-memory ledger that honours idempotency keys the way
 * the wallet does (the same key answers with the first result, `duplicate: true`), enforces the same caller box as the real wallet for the
 * `events` issuer (type bonus, key prefix `event-`), and can fail the ways a network does:
 *
 *   up       normal
 *   down     the connection is dropped BEFORE the request is processed (it never arrived)
 *   lost     the request IS processed, then the connection is dropped (the answer is lost)
 *   broken   500
 *   refuse   403 key_not_allowed (a business refusal: retrying cannot help)
 *   hang     never answers (the client's timeout)
 */
export async function startWalletStub({ secret }) {
  const stub = { mode: 'up', balances: new Map(), txns: new Map(), hits: [], seq: 0 };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const json = (code, b) => { if (!res.destroyed) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); } };
      let claims = null;
      try { claims = verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret, issuers: ['events'] }); } catch { claims = null; }
      stub.hits.push({ method: req.method, path: req.url.replace('/internal/wallet', ''), body, iss: claims?.iss ?? null });
      if (stub.mode === 'hang') return;
      if (stub.mode === 'down') return req.socket.destroy();
      if (stub.mode === 'broken') return json(500, { error: 'boom', code: 'internal' });
      if (stub.mode === 'refuse') return json(403, { error: 'no', code: 'key_not_allowed' });
      if (!claims) return json(401, { error: 'no', code: 'bad_signature' });
      if (req.method !== 'POST' || !req.url.endsWith('/credit')) return json(404, { error: 'not found', code: 'not_found' });
      if (body.type !== 'bonus' || typeof body.key !== 'string' || !body.key.startsWith('event-')) return json(403, { error: 'no', code: 'key_not_allowed' });
      if (!Number.isInteger(body.amount) || body.amount < 1) return json(400, { error: 'amount', code: 'bad_amount' });
      let t = stub.txns.get(body.key);
      const duplicate = !!t;
      if (!t) {
        stub.balances.set(body.uid, (stub.balances.get(body.uid) ?? 0) + body.amount);
        t = { id: String(++stub.seq), uid: body.uid, amount: body.amount, key: body.key, balanceAfter: stub.balances.get(body.uid), refType: body.refType, refId: body.refId };
        stub.txns.set(body.key, t);
      }
      if (stub.mode === 'lost') return req.socket.destroy();
      json(200, { ok: true, txn: { id: t.id, uid: t.uid, amount: t.amount, status: 'posted', idempotencyKey: t.key }, balance: t.balanceAfter, duplicate });
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  stub.url = `http://127.0.0.1:${server.address().port}`;
  stub.balance = (uid) => stub.balances.get(uid) ?? 0;
  stub.keys = () => [...stub.txns.keys()].sort();
  stub.close = () => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
  return stub;
}
