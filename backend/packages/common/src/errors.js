/** A failed call to another service (or to the monolith). Carries the upstream status and body. */
export class ServiceError extends Error {
  /**
   * @param {number} status HTTP status to surface (502 for connection errors, 504 for timeouts)
   * @param {object} body   the `{ error, code, ...extra }` body, passed through unchanged
   * @param {string} [service]
   */
  constructor(status, body, service) {
    super(body?.error || `service error ${status}`);
    this.name = 'ServiceError';
    this.status = status;
    this.body = body || { error: 'Service error.' };
    this.code = this.body.code;
    this.service = service;
  }
}

/** A service token that is missing, malformed, expired, or from the wrong issuer. */
export class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthError';
    this.status = 401;
    this.code = code; // missing_token | malformed_token | bad_signature | token_expired | wrong_issuer | not_configured
  }
}
