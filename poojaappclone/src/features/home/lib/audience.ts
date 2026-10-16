/**
 * Audience segments (docs/HOME_LAYOUT.md §9.1), evaluated ON THE DEVICE so the
 * server never learns who is who. Pure: the hooks gather the facts, these
 * decide. Unknown or unavailable data never matches; an unknown tag never
 * matches (the block is hidden, never shown to everyone).
 */
import type { Segment } from './layout-types';

export const SEGMENTS: readonly Segment[] = ['new_user', 'has_booking', 'in_event', 'lapsed'];

const DAY = 86_400_000;
export const NEW_USER_DAYS = 7;
export const LAPSED_DAYS = 14;

export const isSegment = (tag: unknown): tag is Segment => typeof tag === 'string' && (SEGMENTS as readonly string[]).includes(tag);

/**
 * Does a block / layout addressed to `tags` show for a device in `segments`?
 * Empty = everyone. Otherwise ANY known tag the device is in. Unknown tags
 * contribute nothing, so a layout that only names a newer segment is hidden.
 */
export function matchesAudience(tags: readonly string[] | undefined, segments: ReadonlySet<string> | readonly string[]): boolean {
  if (!tags || tags.length === 0) return true;
  const has = (s: string) => (Array.isArray(segments) ? (segments as readonly string[]).includes(s) : (segments as ReadonlySet<string>).has(s));
  return tags.some((t) => isSegment(t) && has(t));
}

/** Parse an ISO string / epoch ms to ms; null when absent or not a date. */
function toMs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
}

/** Account created within the last 7 days. Unknown or future (clock skew beyond a day) creation = false. */
export function isNewUser(createdAt: unknown, now: number): boolean {
  const at = toMs(createdAt);
  if (at === null) return false;
  const age = now - at;
  return age >= -DAY && age <= NEW_USER_DAYS * DAY;
}

/** The app was last opened MORE than 14 days ago. Never opened before / unreadable = false (a first launch is not a lapse). */
export function isLapsed(lastOpenAt: unknown, now: number): boolean {
  const at = toMs(lastOpenAt);
  if (at === null) return false;
  return now - at > LAPSED_DAYS * DAY;
}

/** At least one booking that is not cancelled. */
export function hasActiveBooking(bookings: readonly { status?: unknown }[] | null | undefined): boolean {
  return Array.isArray(bookings) && bookings.some((b) => !!b && b.status !== 'cancelled');
}

/** Joined an event that has not finished. */
export function inActiveEvent(events: readonly { status?: unknown }[] | null | undefined): boolean {
  return Array.isArray(events) && events.some((e) => !!e && e.status !== 'ended' && e.status !== 'draft');
}
