/** `{ error, code, ...extra }` — the error shape every Bhakti service speaks. */
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
