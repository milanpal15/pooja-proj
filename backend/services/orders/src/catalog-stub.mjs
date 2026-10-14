import http from 'node:http';

import { verifyServiceToken } from '@bhakti/common';

/**
 * A stand-in for the catalog SERVICE's pricing routes, for this service's tests only. Serves exactly what services/catalog/src/modules/pricing
 * answers (same JSON shapes: ISO strings, `packages` / `offerings` rows as stored), from in-memory maps a test fills, and fails on demand:
 * `mode` = 'up' | 'down' (connection dropped) | 'broken' (500) | 'hang'.
 */
export async function startCatalogStub({ secret }) {
  const stub = { mode: 'up', poojas: new Map(), listings: new Map(), temples: new Map(), hits: [] };
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const claims = verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret, issuers: ['orders'] });
      stub.hits.push({ path: u.pathname, iss: claims?.iss ?? null });
      const json = (code, b) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
      if (stub.mode === 'hang') return;
      if (stub.mode === 'down') return req.socket.destroy();
      if (stub.mode === 'broken') return json(500, { error: 'boom', code: 'internal' });
      if (!claims) return json(401, { error: 'no', code: 'bad_signature' });
      let m;
      if ((m = /^\/internal\/catalog\/pricing\/pooja\/([^/]+)\/exists$/.exec(u.pathname))) {
        const p = stub.poojas.get(decodeURIComponent(m[1]));
        return json(200, { exists: !!p && p.enabled !== false && (!p.publishAt || new Date(p.publishAt) <= new Date()) });
      }
      if ((m = /^\/internal\/catalog\/pricing\/pooja\/([^/]+)$/.exec(u.pathname))) {
        const p = stub.poojas.get(decodeURIComponent(m[1]));
        if (!p || p.enabled === false) return json(404, { error: 'That pooja is not available.', code: 'not_found' });
        const t = p.templeSlug ? stub.temples.get(p.templeSlug) : null;
        return json(200, { pooja: { enabled: true, titleHi: null, templeSlug: null, place: '', poojaDate: null, publishAt: null, bookingClosesAt: null, cancelHours: 24, prasadAvailable: false, prasadFeeCoins: 0, ...p }, temple: t ?? null, at: new Date().toISOString() });
      }
      if ((m = /^\/internal\/catalog\/pricing\/chadhava\/([^/]+)$/.exec(u.pathname))) {
        const l = stub.listings.get(decodeURIComponent(m[1]));
        if (!l || l.enabled === false) return json(404, { error: 'That chadhava is not available.', code: 'not_found' });
        const t = l.templeSlug ? stub.temples.get(l.templeSlug) : null;
        return json(200, { listing: { enabled: true, titleHi: null, templeSlug: null, startsAt: null, endsAt: null, ...l }, temple: t ? { slug: t.slug, name: t.name } : null, at: new Date().toISOString() });
      }
      json(404, { error: 'not found', code: 'not_found' });
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  stub.url = `http://127.0.0.1:${server.address().port}`;
  stub.close = () => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
  return stub;
}
