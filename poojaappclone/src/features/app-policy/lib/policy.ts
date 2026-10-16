/**
 * The version / maintenance policy the server hands each build (docs/RELEASES.md §3-§4), and every
 * decision the app makes from it. PURE (no React Native, no storage) so it is unit-tested.
 *
 * The one rule: FAIL OPEN. Anything we cannot understand means "ok" — a garbled answer must never lock
 * a devotee out of the app.
 */
export type PolicyStatus = 'ok' | 'update_available' | 'update_required' | 'blocked' | 'maintenance' | 'unsupported_os';

export type Policy = {
  status: PolicyStatus;
  message: string;
  messageHi: string;
  storeUrl: string;
  minVersionName: string;
  recommendedVersionName: string;
  /** ISO time or null. With `update_available`, the date after which the update becomes mandatory. */
  graceUntil: string | null;
  snoozeDays: number;
  /** ISO time or null. */
  maintenanceUntil: string | null;
  /** The server answered `degraded:true` (its own lookup failed): treat as ok, never cache. */
  degraded: boolean;
};

export const OK_POLICY: Policy = {
  status: 'ok',
  message: '',
  messageHi: '',
  storeUrl: '',
  minVersionName: '',
  recommendedVersionName: '',
  graceUntil: null,
  snoozeDays: 3,
  maintenanceUntil: null,
  degraded: false,
};

const STATUSES: readonly PolicyStatus[] = ['ok', 'update_available', 'update_required', 'blocked', 'maintenance', 'unsupported_os'];
const BLOCKING: readonly PolicyStatus[] = ['update_required', 'blocked', 'maintenance'];

export const statusIsBlocking = (s: PolicyStatus | string | null | undefined): boolean => BLOCKING.includes(s as PolicyStatus);

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.slice(0, max) : '');
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

/** Only https and market:// links open from the gate: the text comes from a server we do not fully control. */
export const isSafeStoreUrl = (u: string): boolean => /^(https:\/\/|market:\/\/)\S+$/i.test(u.trim());

/**
 * A server body -> a Policy. Never throws. A non-object, or an unknown status string, is `ok`
 * (a newer server may add statuses this build does not know).
 */
export function parsePolicy(body: unknown): Policy {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ...OK_POLICY, degraded: true };
  const b = body as Record<string, unknown>;
  const status: PolicyStatus = STATUSES.includes(b.status as PolicyStatus) ? (b.status as PolicyStatus) : 'ok';
  const snooze = typeof b.snoozeDays === 'number' && Number.isFinite(b.snoozeDays) ? Math.min(30, Math.max(1, Math.round(b.snoozeDays))) : 3;
  const storeUrl = str(b.storeUrl, 500).trim();
  return {
    status,
    message: str(b.message),
    messageHi: str(b.messageHi),
    storeUrl: isSafeStoreUrl(storeUrl) ? storeUrl : '',
    minVersionName: str(b.minVersionName, 40),
    recommendedVersionName: str(b.recommendedVersionName, 40),
    graceUntil: isoOrNull(b.graceUntil),
    snoozeDays: snooze,
    maintenanceUntil: isoOrNull(b.maintenanceUntil),
    degraded: b.degraded === true,
  };
}

/**
 * A `426` / `503` from any API call -> the policy it implies (§4 gate responses), or null when it is
 * not a gate answer. `426 app_outdated` carries `status: update_required | blocked`.
 */
export function policyFromGateResponse(httpStatus: number, body: unknown): Policy | null {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!b) return null;
  if (httpStatus === 426 && b.code === 'app_outdated') {
    const status = b.status === 'blocked' ? 'blocked' : 'update_required';
    return parsePolicy({ ...b, status });
  }
  if (httpStatus === 503 && b.code === 'maintenance') return parsePolicy({ ...b, status: 'maintenance' });
  return null;
}

/** Maintenance whose `until` has passed no longer applies (a stale cache must not hold the app shut). */
export function effectivePolicy(policy: Policy, now: number): Policy {
  if (policy.status === 'maintenance' && policy.maintenanceUntil && Date.parse(policy.maintenanceUntil) <= now) return OK_POLICY;
  return policy;
}

/* ------------------------------------------------------------------ cache */

export const CACHE_MAX_AGE_MS = 7 * 24 * 3600_000;

export type CachedPolicy = { policy: Policy; savedAt: number };

export const serializeCache = (policy: Policy, now: number): string => JSON.stringify({ policy, savedAt: now } satisfies CachedPolicy);

/**
 * The cached answer to use while offline: only if it parses, is younger than a week, and (for
 * maintenance) has not passed its `until`. Anything else -> null (fail open).
 */
export function readCache(raw: string | null, now: number): Policy | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { policy?: unknown; savedAt?: unknown };
    if (typeof o.savedAt !== 'number' || now - o.savedAt > CACHE_MAX_AGE_MS || now < o.savedAt - 60_000) return null;
    const policy = effectivePolicy(parsePolicy(o.policy), now);
    return policy.degraded ? null : policy;
  } catch {
    return null;
  }
}

/** Foreground refreshes are throttled; a forced check (Retry, sign-in change) always goes. */
export const POLICY_REFRESH_MS = 10 * 60_000;
export const shouldRefetch = (lastAttemptAt: number | null, now: number, force = false): boolean =>
  force || lastAttemptAt == null || now < lastAttemptAt || now - lastAttemptAt >= POLICY_REFRESH_MS;

/* ----------------------------------------------------------------- nudge */

/** A snooze belongs to one offer: a newer recommended build, or a new deadline, asks again. */
export const nudgeKey = (p: Policy): string => `${p.recommendedVersionName}|${p.graceUntil ?? ''}`;

export type Snooze = { key: string; until: number };

export const parseSnooze = (raw: string | null): Snooze | null => {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<Snooze>) : null;
    return o && typeof o.key === 'string' && typeof o.until === 'number' ? { key: o.key, until: o.until } : null;
  } catch {
    return null;
  }
};

/** The `snoozedUntil` that applies to THIS offer (0 = not snoozed). */
export const snoozedUntilFor = (s: Snooze | null, p: Policy): number => (s && s.key === nudgeKey(p) ? s.until : 0);

/**
 * When a dismissed banner may return: `snoozeDays` from now, but never later than the grace deadline,
 * so "update by <date>" cannot be snoozed past its own date.
 */
export function snoozeUntil(policy: Policy, now: number): number {
  const until = now + policy.snoozeDays * 86_400_000;
  const grace = policy.graceUntil ? Date.parse(policy.graceUntil) : NaN;
  return Number.isFinite(grace) && grace > now ? Math.min(until, grace) : until;
}

/** Show the dismissible "update available" banner? Never for other statuses; not while snoozed. */
export const shouldShowNudge = (policy: Policy, snoozedUntil: number, now: number): boolean =>
  policy.status === 'update_available' && now >= snoozedUntil;

/* ------------------------------------------------------------ presentation */

/** The server's message in the app language (Hindi only when it has written one), else the built-in text. */
export function pickMessage(policy: Pick<Policy, 'message' | 'messageHi'>, lang: 'en' | 'hi' | null, fallback: string): string {
  const hi = policy.messageHi.trim();
  const en = policy.message.trim();
  if ((lang ?? 'hi') === 'hi' && hi) return hi;
  return en || fallback;
}

const IST_MS = 5.5 * 3600_000;
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्तू', 'नव', 'दिस'],
};

/** "30 Oct 2026" in IST, or '' when the input is not a date. No Intl: Hermes' support varies. */
export function formatIstDate(iso: string | null, lang: 'en' | 'hi' | null): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + IST_MS);
  return `${d.getUTCDate()} ${MONTHS[lang === 'en' ? 'en' : 'hi'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "30 Oct 2026, 6:30 PM" in IST. */
export function formatIstDateTime(iso: string | null, lang: 'en' | 'hi' | null): string {
  const date = formatIstDate(iso, lang);
  if (!date) return '';
  const d = new Date(Date.parse(iso as string) + IST_MS);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date}, ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
