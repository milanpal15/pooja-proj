/**
 * An error a service can throw and the router turns into a response.
 *
 * Responses keep the shape the existing clients already read — `{ error }` is
 * a human string — and add a machine `code` plus any extra fields, so the app
 * can react to `insufficient_coins` without matching on English.
 *
 *   throw new HttpError(402, 'insufficient_coins', 'Not enough coins', { needed, balance, shortfall });
 */
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Express error middleware for routers that throw `HttpError`. Mount after them. */
// eslint-disable-next-line no-unused-vars -- Express needs the 4th argument.
export function httpErrorHandler(err, _req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  }
  return next(err);
}
