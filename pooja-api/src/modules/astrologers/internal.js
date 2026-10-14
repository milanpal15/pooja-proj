import { config } from '../../config/env.js';
import { bearer, verifyServiceToken } from '../../lib/service-jwt.js';
import { Astrologer } from './astrologer.model.js';
import { claimActiveAstrologer } from './claim.js';

const ALLOWED_ISSUERS = ['identity'];

const view = (a) => (a ? { id: String(a._id), name: a.name } : null);

/**
 * Service-to-service: the identity service asks the monolith (which still owns astrologers until phase 6) about
 * an astrologer. Phase 2 of docs/MICROSERVICES.md; mounted only when IDENTITY_URL is set and CALLS_URL is not (phase 6 moves them to the calls service).
 *
 *   POST /internal/astrologers/claim   { decoded: { uid, email?, email_verified?, phone_number?, firebase? } }
 *        -> { astrologer: { id, name } | null }
 *      The sign-in claim: takes the invite that matches the identifiers the provider VERIFIED (atomic) and
 *      answers the active astrologer, or null. Identity applies the role and name to the user it owns.
 *   GET  /internal/astrologers/active?uid=
 *        -> { astrologer: { id, name } | null }       (profile reads; read-only)
 *
 * Authenticated by a service JWT (INTERNAL_JWT_SECRET) whose issuer is `identity`; nothing else may call it.
 * `/internal` is outside `/api`, so the operator gate does not apply, and the BFFs forward only `/api` and `/uploads`.
 */
export function mountInternalAstrologers(app) {
  const guard = (req, res, next) => {
    const secret = config.internalJwtSecret;
    // CALLS_URL set (phase 6): the calls service owns astrologers and answers these (at /internal/calls/directory/astrologers/...); here they do not exist.
    if (!secret || !config.identityUrl || config.callsUrl) return res.status(404).end();
    const claims = verifyServiceToken(bearer(req.headers.authorization), { secret, issuers: ALLOWED_ISSUERS });
    if (!claims) return res.status(401).json({ error: 'Invalid service token.', code: 'bad_token' });
    req.auth = claims;
    next();
  };

  app.post('/internal/astrologers/claim', guard, async (req, res, next) => {
    try {
      const d = req.body?.decoded;
      if (!d || typeof d.uid !== 'string' || !d.uid) return res.status(400).json({ error: 'decoded.uid required', code: 'bad_request' });
      // Only what the claim reads; the identity service forwards verified token fields, nothing else is honoured.
      const decoded = {
        uid: d.uid,
        email: typeof d.email === 'string' ? d.email : undefined,
        email_verified: d.email_verified === true,
        phone_number: typeof d.phone_number === 'string' ? d.phone_number : undefined,
        firebase: { sign_in_provider: typeof d.firebase?.sign_in_provider === 'string' ? d.firebase.sign_in_provider : undefined },
      };
      res.json({ astrologer: view(await claimActiveAstrologer(decoded)) });
    } catch (e) {
      next(e);
    }
  });

  app.get('/internal/astrologers/active', guard, async (req, res, next) => {
    try {
      const uid = String(req.query.uid ?? '');
      if (!uid) return res.status(400).json({ error: 'uid required', code: 'bad_request' });
      res.json({ astrologer: view(await Astrologer.findOne({ uid, status: 'active' }).select('name').lean()) });
    } catch (e) {
      next(e);
    }
  });
}
