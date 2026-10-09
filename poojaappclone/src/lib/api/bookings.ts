import { authedFetch } from './client';

export type BookingStatus = 'booked' | 'sankalp' | 'performed' | 'cancelled';

export type BookingName = { name: string; gotra: string };

/**
 * A pooja this devotee booked, paid for in coins.
 *
 * `totalCoins` is what the SERVER charged — the phone never sends a price.
 * `canCancel` / `canReview` are the server's verdict; the UI does not
 * recompute the cancel window.
 */
export type Booking = {
  id: string;
  bookingRef: string;
  kind: 'pooja';
  poojaSlug: string;
  poojaTitle: string;
  poojaTitleHi: string;
  templeName: string;
  place: string;
  /** `YYYY-MM-DD`, or null for "every day". */
  poojaDate: string | null;
  packageKey: string;
  packageName: string;
  persons: number;
  names: BookingName[];
  prasad: boolean;
  totalCoins: number;
  packageCoins: number;
  prasadCoins: number;
  status: BookingStatus;
  statusHistory: { status: BookingStatus; at: string }[];
  refunded: boolean;
  canCancel: boolean;
  /** ISO. */
  cancelBy: string | null;
  review: { rating: number; text: string; createdAt: string } | null;
  canReview: boolean;
  createdAt: string;
};

/** Everything the server needs to price and record a booking. No amounts. */
export type NewBooking = {
  poojaSlug: string;
  packageKey: string;
  names: BookingName[];
  prasad: boolean;
  /** Required iff `prasad`. */
  address?: { line1: string; city: string; pincode: string };
  /** Idempotency key: the same id twice is one charge. */
  requestId: string;
};

export async function fetchBookings(): Promise<Booking[]> {
  const { bookings } = (await authedFetch('/api/bookings')) as { bookings?: Booking[] };
  return bookings ?? [];
}

export async function fetchBooking(id: string): Promise<Booking> {
  const { booking } = (await authedFetch(`/api/bookings/${encodeURIComponent(id)}`)) as {
    booking: Booking;
  };
  return booking;
}

/** 201 for a new booking, 200 for a retried `requestId` — same body either way. */
export function createBooking(body: NewBooking) {
  return authedFetch('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<{ booking: Booking; balance?: number }>;
}

/** Allowed while `booked` and before `cancelBy`; refunds the coins. 409 `cannot_cancel` otherwise. */
export function cancelBooking(id: string) {
  return authedFetch(`/api/bookings/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  }) as Promise<{ booking?: Booking; balance?: number }>;
}

/** Once, on a `performed` booking. 409 `not_reviewable` otherwise. */
export function reviewBooking(id: string, rating: number, text?: string) {
  return authedFetch(`/api/bookings/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify({ rating, text: text?.trim() || undefined }),
  }) as Promise<{ review?: Booking['review']; booking?: Booking }>;
}
