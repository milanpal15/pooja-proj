/**
 * The account / device block (docs/USERS.md §3-§4). The API client reports a `403 account_blocked` /
 * `403 device_blocked` answer from ANY call (sign-in included) here, and features/account-blocked, which
 * owns the screen, subscribes — the same pattern as gate-signal.ts. Pure — no React Native.
 *
 * FAIL SAFE: only a 403 whose body carries one of the two known codes is a block. A 403 without a code
 * (a proxy, a permission error, a garbled body) is NOT, so it can never lock a devotee out.
 */
export type BlockCode = 'account_blocked' | 'device_blocked';

export type BlockInfo = {
  code: BlockCode;
  /** Operator-facing English reason, '' when the server sent none. */
  message: string;
  messageHi: string;
  /** ISO time the block lifts, or null for an open-ended block. */
  until: string | null;
  support: { email: string; phone: string };
};

export const isBlockCode = (c: unknown): c is BlockCode => c === 'account_blocked' || c === 'device_blocked';

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** An HTTP answer -> a block, or null. Never throws. */
export function parseBlock(httpStatus: number, body: unknown): BlockInfo | null {
  if (httpStatus !== 403 || !body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!isBlockCode(b.code)) return null;
  const until = typeof b.until === 'string' && Number.isFinite(Date.parse(b.until)) ? b.until : null;
  const s = b.support && typeof b.support === 'object' && !Array.isArray(b.support) ? (b.support as Record<string, unknown>) : {};
  return {
    code: b.code,
    // The server's `error` is the short English reason when it sends no operator `message`.
    message: str(b.message),
    messageHi: str(b.messageHi),
    until,
    support: { email: str(s.email, 200), phone: str(s.phone, 40) },
  };
}

type Listener = (b: BlockInfo) => void;
const listeners = new Set<Listener>();

export function onBlockSignal(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitBlockSignal(b: BlockInfo): void {
  for (const fn of [...listeners]) {
    try {
      fn(b);
    } catch {
      // a listener must never break the request that triggered it
    }
  }
}
