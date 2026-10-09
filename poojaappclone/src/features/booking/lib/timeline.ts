import type { Booking, BookingStatus } from '@/lib/api';

export type StepState = 'done' | 'now' | 'todo';
export type TimelineStep = { status: BookingStatus; state: StepState; at: string | null };

const FLOW: BookingStatus[] = ['booked', 'sankalp', 'performed'];

/**
 * The status timeline from `statusHistory`. Reached steps are `done` (with
 * their time), the first unreached one is `now`, the rest `todo`. A cancelled
 * booking shows what happened and then `cancelled`, with no future steps.
 */
export function timelineSteps(b: Pick<Booking, 'status' | 'statusHistory'>): TimelineStep[] {
  const at = (s: BookingStatus) => b.statusHistory.find((h) => h.status === s)?.at ?? null;

  if (b.status === 'cancelled') {
    const reached = FLOW.filter((s) => at(s));
    return [
      ...reached.map((s) => ({ status: s, state: 'done' as const, at: at(s) })),
      { status: 'cancelled' as const, state: 'now' as const, at: at('cancelled') },
    ];
  }

  const idx = FLOW.indexOf(b.status);
  return FLOW.map((s, i) => ({
    status: s,
    // Reached steps are done; the first one not yet reached is what we are waiting on.
    state: i <= idx ? ('done' as const) : i === idx + 1 ? ('now' as const) : ('todo' as const),
    at: at(s),
  }));
}
