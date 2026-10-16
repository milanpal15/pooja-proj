/**
 * The counter's tap queue — pure, so the rules are tested without a phone (counter-queue.test.mjs).
 *
 * A devotee taps fast (a 108-count japa); the server accepts at most one request per ~400 ms per
 * task. So taps are batched: they pile up as `pending`, a flush sends them as ONE `{add:n}`
 * (`inflight` while the request is out), and the server's count is the only thing ever trusted:
 *
 *   shown = confirmed (server) + inflight + pending, never above the target.
 *
 * Unsent taps (`inflight + pending`) are persisted by the caller so they survive an app kill.
 */

/** The server accepts `add` of 1..200. */
export const MAX_ADD = 200;
/** Quiet time after the last tap before a flush. */
export const DEBOUNCE_MS = 700;
/** The server's cap is one add per 400 ms; stay clear of it. */
export const MIN_GAP_MS = 500;

export type CounterState = {
  /** The server's count. */
  confirmed: number;
  /** Taps in the request that is out right now. */
  inflight: number;
  /** Taps not yet sent. */
  pending: number;
  target: number;
  done: boolean;
};

const clampInt = (n: unknown, lo: number, hi: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
};

/** Start from the server's `state.count`, plus any unsent taps saved by an earlier session. */
export function initCounter(confirmed: unknown, target: unknown, unsent = 0, done = false): CounterState {
  const t = Math.max(1, clampInt(target, 1, 1_000_000));
  const c = clampInt(confirmed, 0, t);
  const finished = done || c >= t;
  return { confirmed: finished ? t : c, inflight: 0, pending: finished ? 0 : clampInt(unsent, 0, t - c), target: t, done: finished };
}

/** What the big number shows. */
export const shown = (s: CounterState) => (s.done ? s.target : Math.min(s.target, s.confirmed + s.inflight + s.pending));

/** Taps not yet acknowledged by the server — what must be persisted. */
export const unsent = (s: CounterState) => (s.done ? 0 : s.inflight + s.pending);

/** One tap. A no-op once the target is reached (further taps count for nothing). */
export function tap(s: CounterState): CounterState {
  if (s.done || shown(s) >= s.target) return s;
  return { ...s, pending: s.pending + 1 };
}

/** The next request to send, or null when one is already out / nothing is waiting. */
export function nextBatch(s: CounterState): { state: CounterState; add: number } | null {
  if (s.done || s.inflight > 0 || s.pending <= 0) return null;
  const add = Math.min(s.pending, MAX_ADD);
  return { state: { ...s, inflight: add, pending: s.pending - add }, add };
}

/** The server accepted the batch: adopt ITS count. */
export function applySuccess(s: CounterState, serverCount: unknown, done: boolean): CounterState {
  const confirmed = clampInt(serverCount, 0, s.target);
  const finished = done || confirmed >= s.target;
  return { ...s, confirmed: finished ? s.target : confirmed, inflight: 0, pending: finished ? 0 : Math.min(s.pending, s.target - confirmed), done: finished };
}

/**
 * 429 `too_fast`: the server did NOT apply the batch. Adopt its count (it may be ahead of ours) and put
 * the batch back in the queue — dropping it would silently lose the devotee's taps.
 */
export function applyTooFast(s: CounterState, serverCount: unknown): CounterState {
  const confirmed = clampInt(serverCount, 0, s.target);
  return { ...s, confirmed, inflight: 0, pending: Math.min(s.target - confirmed, s.pending + s.inflight), done: confirmed >= s.target };
}

/** The request never reached the server (offline): the batch goes back to pending to be retried. */
export function applyOffline(s: CounterState): CounterState {
  return { ...s, inflight: 0, pending: Math.min(s.target - s.confirmed, s.pending + s.inflight) };
}

/** A definitive refusal (locked, closed, not registered…): nothing waiting can ever be accepted. */
export function applyRejected(s: CounterState): CounterState {
  return { ...s, inflight: 0, pending: 0 };
}

/** How long to wait before the next flush: the debounce, but never inside the server's cap. */
export function flushDelay(now: number, lastSentAt: number | null): number {
  if (lastSentAt === null) return DEBOUNCE_MS;
  return Math.max(DEBOUNCE_MS, MIN_GAP_MS - (now - lastSentAt));
}

/** Storage key for the unsent taps of one task — per devotee, so accounts never share a queue. */
export const unsentKey = (uid: string, slug: string, mKey: string, tKey: string) => `events.counter.v1.${uid}.${slug}.${mKey}.${tKey}`;

/** Parses a stored unsent count; anything unexpected is 0. */
export function parseUnsent(raw: string | null): number {
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw) as { pending?: unknown };
    return clampInt(v?.pending, 0, 1_000_000);
  } catch {
    return 0;
  }
}
