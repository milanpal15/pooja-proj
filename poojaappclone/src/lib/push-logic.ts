/**
 * Pure decisions behind push notifications, kept apart from the native module so they can be tested without a phone.
 */

export const CHANNEL_CALLS = 'incoming-calls';
export const CHANNEL_DEFAULT = 'default';

/** What a notification's `data` asks the app to do when it is tapped: a route to open, or null for "just open the app". */
export function routeForNotification(data: unknown, opts: { astrologer: boolean }): string | null {
  const type = (data as { type?: unknown } | null | undefined)?.type;
  if (type === 'incoming_call') return opts.astrologer ? '/astro-home' : null;
  return null;
}

/** A token worth sending to the server: a non-empty string of sane length. */
export function usableToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 && t.length <= 4096 ? t : null;
}

/** Re-send only when the token or the account changed since the last successful registration. */
export function needsRegistration(prev: { token: string; uid: string } | null, token: string, uid: string): boolean {
  return !prev || prev.token !== token || prev.uid !== uid;
}
