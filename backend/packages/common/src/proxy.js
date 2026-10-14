/**
 * Streaming reverse proxy for the thin-gateway BFFs.
 *
 * Request and response bodies are PIPED, never buffered or re-parsed: media (Range/206), webhook
 * signatures and multipart uploads all depend on the exact bytes. Multiple Set-Cookie headers
 * survive (Node hands them over as an array). The upstream's `access-control-*` headers are dropped
 * because the BFF's own CORS middleware owns that decision.
 */
import http from 'node:http';
import https from 'node:https';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'upgrade', 'proxy-connection',
]);

/**
 * @param {object} o
 * @param {string} o.target
 * @param {number} [o.timeoutMs]
 * @param {(req, headers: object) => void} [o.transformHeaders]
 * @param {(req) => string} [o.pathFor]  the upstream path (+ query) for a request; default = the request's own URL. Lets a BFF
 *        stream a public path (`/uploads/<id>.png`) from a service's internal one (`/internal/catalog/media/<id>.png`)
 * @param {{status:number, error:string}} [o.unavailable]  what to answer when the upstream cannot be reached (default 502
 *        `upstream_unavailable`; the catalog media route answers 503 `catalog_unavailable`)
 */
export function createProxy({ target, timeoutMs = 30_000, logger, transformHeaders, pathFor, unavailable }) {
  const url = new URL(target);
  const lib = url.protocol === 'https:' ? https : http;
  const agent = new lib.Agent({ keepAlive: true, maxSockets: 256 });

  return function proxy(req, res) {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP_BY_HOP.has(k)) headers[k] = v;
    headers.host = url.host;
    // Overwrite (not append) so a client cannot forge its address; the monolith's login throttle reads it.
    headers['x-forwarded-for'] = req.ip || req.socket.remoteAddress || '';
    headers['x-forwarded-proto'] = req.protocol;
    headers['x-forwarded-host'] = req.headers.host || '';
    if (req.id) headers['x-request-id'] = req.id;
    // Identity phase: the BFF replaces the end user's credentials (Firebase token / cookie) with its own signed service token.
    transformHeaders?.(req, headers);

    let answered = false;
    const upstreamFailed = (status, error) => {
      if (answered || res.headersSent) return res.destroy();
      answered = true;
      res.status(status).json({ error, code: error });
    };

    const upReq = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        method: req.method,
        path: pathFor ? pathFor(req) : req.originalUrl,
        headers,
        agent,
      },
      (upRes) => {
        answered = true;
        const out = {};
        for (const [k, v] of Object.entries(upRes.headers)) {
          if (HOP_BY_HOP.has(k) || k.startsWith('access-control-')) continue;
          out[k] = v;
        }
        // Keep whatever CORS already put in Vary (`Origin`) alongside the upstream's.
        const mine = res.getHeader('vary');
        if (mine) out.vary = [...new Set([].concat(mine, out.vary || []).join(', ').split(/\s*,\s*/))].join(', ');
        res.writeHead(upRes.statusCode, upRes.statusMessage, out);
        upRes.pipe(res);
        upRes.on('error', () => res.destroy());
      },
    );

    upReq.setTimeout(timeoutMs, () => upReq.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT_PROXY' })));
    upReq.on('error', (e) => {
      logger?.warn(`upstream error ${e.code || e.message}`, { reqId: req.id });
      if (unavailable) return upstreamFailed(unavailable.status, unavailable.error);
      upstreamFailed(e.code === 'ETIMEDOUT_PROXY' ? 504 : 502, e.code === 'ETIMEDOUT_PROXY' ? 'upstream_timeout' : 'upstream_unavailable');
    });
    res.on('close', () => {
      if (!res.writableEnded) upReq.destroy();
    });
    req.pipe(upReq);
  };
}

/** Resolves when the upstream's `/api/health` answers 200; rejects otherwise. */
export function probeUpstream(target, path = '/api/health', timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, target);
    const lib = url.protocol === 'https:' ? https : http;
    const r = lib.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      res.statusCode === 200 ? resolve() : reject(Object.assign(new Error(`status ${res.statusCode}`), { code: `status_${res.statusCode}` }));
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('timeout'), { code: 'timeout' })));
    r.on('error', (e) => reject(Object.assign(new Error(e.code || e.message), { code: e.code || 'unreachable' })));
  });
}
