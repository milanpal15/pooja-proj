import { config } from '../../config/env.js';
import { bearer, verifyServiceToken } from '../../lib/service-jwt.js';
import { AuditLog } from './audit.model.js';

const ALLOWED_ISSUERS = ['admin-bff'];
const str = (v, max = 200) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);

/**
 * `POST /internal/audit` - lets the admin BFF record the audit entry for a write it handled itself (a route
 * that moved to a service), since only the monolith owns the AuditLog until the identity phase moves it.
 * Same fields `auditWrites` records for monolith-handled routes; never a request body.
 *
 * Authenticated by a service JWT (INTERNAL_JWT_SECRET), not by an operator session. Not mounted at all when
 * no secret is configured. `/internal` is outside `/api`, and the BFFs only forward `/api` and `/uploads`.
 */
export function mountInternalAudit(app) {
  app.post('/internal/audit', async (req, res) => {
    const secret = config.internalJwtSecret;
    if (!secret || config.identityUrl) return res.status(404).end(); // identity owns the audit log once IDENTITY_URL is set
    const claims = verifyServiceToken(bearer(req.headers.authorization), { secret, issuers: ALLOWED_ISSUERS });
    if (!claims) return res.status(401).json({ error: 'Invalid service token.', code: 'bad_token' });
    const b = req.body ?? {};
    const operator = str(b.operator, 64);
    if (!operator) return res.status(400).json({ error: 'operator required', code: 'bad_request' });
    await AuditLog.create({
      operator,
      role: str(b.role, 20),
      area: str(b.area, 40),
      method: str(b.method, 10),
      path: str(b.path, 300),
      targetId: str(b.targetId, 100),
      status: Number.isInteger(b.status) ? b.status : undefined,
    });
    res.json({ ok: true });
  });
}
