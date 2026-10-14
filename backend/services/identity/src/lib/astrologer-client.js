import { createServiceClient } from '@bhakti/common';

/**
 * Identity -> calls (docs/MICROSERVICES.md section 2: identity -> calls). Astrologers lived in the monolith until phase 6; with CALLS_URL set the calls
 * service owns them and this client talks to it, with CALLS_URL unset it talks to the monolith's internal endpoints exactly as before:
 *
 *   CALLS_URL set    POST {CALLS_URL}/internal/calls/directory/astrologers/claim     GET {CALLS_URL}/internal/calls/directory/astrologers/active?uid=
 *   CALLS_URL unset  POST {MONOLITH_URL}/internal/astrologers/claim                 GET {MONOLITH_URL}/internal/astrologers/active?uid=
 *
 * Same request and response shapes either way: `{ astrologer: { id, name } | null }`. Signed `iss identity`, which both callees accept from nobody else.
 *
 * Failure policy lives with the caller (routes/auth.js): an astrologer lookup that cannot be made is a 503 only for an
 * account that IS an astrologer (their shell cannot render without it); a plain devotee just carries on as a devotee.
 */
export function createAstrologerClient(config, { fetchImpl } = {}) {
  const toCalls = Boolean(config.callsUrl);
  const client = createServiceClient({
    service: 'astrologers',
    baseUrl: toCalls ? config.callsUrl : config.monolithUrl,
    iss: 'identity',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const base = toCalls ? '/internal/calls/directory/astrologers' : '/internal/astrologers';
  const pick = (d) => (d?.astrologer ? { id: String(d.astrologer.id), name: d.astrologer.name } : null);
  return {
    /** Claim the invite matching the verified identifiers; the active astrologer or null. */
    claim: async (decoded, reqId) =>
      pick(await client.post(`${base}/claim`, { decoded: {
        uid: decoded.uid, email: decoded.email, email_verified: decoded.email_verified === true,
        phone_number: decoded.phone_number, firebase: { sign_in_provider: decoded.firebase?.sign_in_provider },
      } }, { reqId })),
    /** The active astrologer for a uid or null (read only). */
    active: async (uid, reqId) => pick(await client.get(`${base}/active`, { query: { uid }, reqId })),
    breaker: client.breaker,
  };
}
