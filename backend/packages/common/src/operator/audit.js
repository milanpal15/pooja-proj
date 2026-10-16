import { areaFor } from './access/routes.js';

/** An id in the path, or the key of the few resources addressed by name (same rule as the monolith's audit.js). */
export function targetOf(path) {
  const hex = path.split('/').find((s) => /^[0-9a-f]{24}$/i.test(s));
  if (hex) return hex;
  return path.match(/^\/(?:flags|admin\/policies|admin\/roles|horoscope\/day)\/([^/]+)(?:\/duplicate)?$/)?.[1];
}

const READ = new Set(['GET', 'HEAD', 'OPTIONS']);

/* ------------------------------------------------------------ before / after detail -- */

/** The response header a service sets on a write to say what changed (base64 JSON `{ before, after, selfApproved? }`). The admin BFF stores it and never forwards it. */
export const AUDIT_DETAIL_HEADER = 'x-audit-detail';
/** Per side, after JSON encoding. (A header also has to fit the HTTP header limit, so services keep their details far smaller.) */
export const AUDIT_DETAIL_MAX_BYTES = 8 * 1024;
/** Keys that are never stored in a diff, at any depth: credentials and personal data. */
const SECRET_KEY = /pass(word)?|secret|token|hash|otp|phone|email|contact|authorization|cookie|signature|api[-_]?key/i;

/** A copy of `value` safe to store: secret-looking keys dropped, strings clipped, depth and size bounded. */
export function sanitizeAuditValue(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 6) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitizeAuditValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k) || k === '__v') continue;
      out[k] = sanitizeAuditValue(v, depth + 1);
    }
    return out;
  }
  return undefined;
}

const fitted = (v) => {
  const clean = sanitizeAuditValue(v);
  return clean === undefined || JSON.stringify(clean ?? null).length <= AUDIT_DETAIL_MAX_BYTES ? clean ?? null : { _truncated: true };
};

/** `{ before, after, selfApproved? }` sanitised and bounded - or null when there is nothing to keep. */
export function sanitizeAuditDetail(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const out = { before: fitted(detail.before), after: fitted(detail.after) };
  if (detail.selfApproved === true) out.selfApproved = true;
  return out.before === null && out.after === null && !out.selfApproved ? null : out;
}

/** For a service: the header value for `res.setHeader(AUDIT_DETAIL_HEADER, ...)`. Oversized sides are replaced by a marker so the header always fits. */
export function encodeAuditDetail(detail) {
  const d = sanitizeAuditDetail(detail) ?? { before: null, after: null };
  let json = JSON.stringify(d);
  if (json.length > 9000) json = JSON.stringify({ ...d, before: { _truncated: true }, after: { _truncated: true } });
  return Buffer.from(json, 'utf8').toString('base64');
}

/** For the BFF: the header value back to a sanitised detail, or null (absent, malformed). */
export function decodeAuditDetail(value) {
  if (typeof value !== 'string' || !value || value.length > 24_000) return null;
  try {
    return sanitizeAuditDetail(JSON.parse(Buffer.from(value, 'base64').toString('utf8')));
  } catch {
    return null;
  }
}

const entryOf = ({ operator, method, path, status, detail }) => {
  const d = sanitizeAuditDetail(detail);
  return {
    operator: operator.username || 'unknown',
    role: operator.role,
    area: areaFor(method, path).area,
    method,
    path: `/api${path}`,
    targetId: targetOf(path),
    status,
    ...(d ? { before: d.before, after: d.after, ...(d.selfApproved ? { selfApproved: true } : {}) } : {}),
  };
};

/**
 * Identity phase: the audit log is identity's. Same entry, same rule (successful writes only, never a body, failures
 * logged and swallowed) - posted to `POST /internal/identity/audit`. The admin BFF calls this for EVERY operator write it
 * lets through, whether it served the route itself or proxied it to the monolith.
 */
export function createIdentityAuditor({ client, logger }) {
  return function record({ operator, method, path, status, reqId, detail }) {
    if (READ.has(method) || status >= 400) return;
    client
      .post('/internal/identity/audit', entryOf({ operator, method, path, status, detail }), { reqId, as: { sub: operator.id ?? operator.username, role: operator.role, ctx: { username: operator.username } } })
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
