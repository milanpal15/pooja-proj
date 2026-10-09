import { areaFor } from '../../access/routes.js';
import { AuditLog } from './audit.model.js';

const READ = new Set(['GET', 'HEAD', 'OPTIONS']);

/** An id in the path, or the key of the few resources addressed by name. */
function targetOf(path) {
  const hex = path.split('/').find((s) => /^[0-9a-f]{24}$/i.test(s));
  if (hex) return hex;
  return path.match(/^\/(?:flags|admin\/policies|horoscope\/day)\/([^/]+)$/)?.[1];
}

/**
 * Records every SUCCESSFUL write by a signed-in operator.
 *
 * Mount straight after the gate. It hooks the response's `finish`, so it sees
 * the final status (a 403 from the gate never reaches it, and a failed write
 * is not logged as a change), and it never delays or breaks the response: a
 * failure to log is logged to the console and swallowed.
 */
export function auditWrites(req, res, next) {
  if (!READ.has(req.method) && req.operator) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const path = req.path;
      AuditLog.create({
        operator: req.operator.username,
        role: req.operator.role,
        area: areaFor(req.method, path).area,
        method: req.method,
        path: `/api${path}`,
        targetId: targetOf(path),
        status: res.statusCode,
      }).catch((e) => console.error('✗ audit log write failed:', e.message));
    });
  }
  next();
}
