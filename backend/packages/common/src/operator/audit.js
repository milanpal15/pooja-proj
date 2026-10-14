import { areaFor } from './access/routes.js';

/** An id in the path, or the key of the few resources addressed by name (same rule as the monolith's audit.js). */
export function targetOf(path) {
  const hex = path.split('/').find((s) => /^[0-9a-f]{24}$/i.test(s));
  if (hex) return hex;
  return path.match(/^\/(?:flags|admin\/policies|horoscope\/day)\/([^/]+)$/)?.[1];
}

const READ = new Set(['GET', 'HEAD', 'OPTIONS']);

const entryOf = ({ operator, method, path, status }) => ({
  operator: operator.username || 'unknown',
  role: operator.role,
  area: areaFor(method, path).area,
  method,
  path: `/api${path}`,
  targetId: targetOf(path),
  status,
});

/**
 * Identity phase: the audit log is identity's. Same entry, same rule (successful writes only, never a body, failures
 * logged and swallowed) - posted to `POST /internal/identity/audit`. The admin BFF calls this for EVERY operator write it
 * lets through, whether it served the route itself or proxied it to the monolith.
 */
export function createIdentityAuditor({ client, logger }) {
  return function record({ operator, method, path, status, reqId }) {
    if (READ.has(method) || status >= 400) return;
    client
      .post('/internal/identity/audit', entryOf({ operator, method, path, status }), { reqId, as: { sub: operator.id ?? operator.username, role: operator.role, ctx: { username: operator.username } } })
      .catch((e) => logger?.error(`audit write failed for ${method} /api${path}: ${e?.message}`));
  };
}

/**
 * Records a SUCCESSFUL operator write that the admin BFF served itself, by POSTing to the monolith's
 * `POST /internal/audit` (the AuditLog collection stays there until the identity phase). Same fields, same
 * rule as the monolith's `auditWrites`: no request bodies, failures logged and swallowed - never delays or
 * breaks the operator's response.
 */
export function createAuditor({ iss = 'admin-bff', monolithUrl, signToken, logger, fetchImpl = fetch }) {
  const target = new URL('/internal/audit', monolithUrl).toString();
  return function record({ operator, method, path, status }) {
    if (READ.has(method) || status >= 400) return;
    const token = signToken({ iss, sub: operator.username });
    fetchImpl(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        operator: operator.username || 'unknown',
        role: operator.role,
        area: areaFor(method, path).area,
        method,
        path: `/api${path}`,
        targetId: targetOf(path),
        status,
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => {
        if (!r.ok) logger?.error(`audit write refused (${r.status}) for ${method} /api${path}`);
      })
      .catch((e) => logger?.error(`audit write failed for ${method} /api${path}: ${e.message}`));
  };
}
