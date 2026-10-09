export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True once the deadline has passed — booking is shut. */
  closed: boolean;
};

/**
 * Time left to book. `null` when the pooja has no deadline (the countdown is
 * hidden then, not shown as zeros). `nowMs` is injected so this is testable and
 * so one ticking clock drives the whole screen.
 */
export function countdownTo(closesAtIso: string | null | undefined, nowMs: number): Countdown | null {
  if (!closesAtIso) return null;
  const end = Date.parse(closesAtIso);
  if (!Number.isFinite(end)) return null;
  const left = Math.max(0, Math.floor((end - nowMs) / 1000));
  return {
    days: Math.floor(left / 86_400),
    hours: Math.floor((left % 86_400) / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
    closed: end <= nowMs,
  };
}
