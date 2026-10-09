/**
 * The idempotency key for one money-moving action ("Pay N coins").
 *
 * The server charges once per `requestId`, so the id must be:
 *   - the SAME across retries of the same order (a dropped connection may have
 *     reached the server; a fresh id on retry would charge twice),
 *   - DIFFERENT once the order itself changes (other package, other names).
 *
 * `signature` is any stable string describing the order's contents. Pure, with
 * the id generator injected, so the rule is unit-tested without a phone.
 */
export type RequestKeeper = {
  /** The id to send for an order with this signature. */
  idFor: (signature: string) => string;
  /** Forget the id — call on a definitive answer (success or a 4xx refusal). */
  clear: () => void;
};

export function createRequestKeeper(generate: () => string): RequestKeeper {
  let current: { signature: string; id: string } | null = null;
  return {
    idFor(signature) {
      if (current?.signature !== signature) current = { signature, id: generate() };
      return current.id;
    },
    clear() {
      current = null;
    },
  };
}
