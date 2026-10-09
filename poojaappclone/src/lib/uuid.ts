/**
 * A v4-shaped UUID for idempotency keys (`requestId`). Not a secret — it only
 * has to be unique per user action — so `Math.random` is acceptable where the
 * runtime has no `crypto`.
 */
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
