/**
 * Decisions behind the account / device blocked screen (docs/USERS.md §3-§4). PURE — no React Native —
 * so it is unit-tested. The 403 parser and the bus live in lib/api/block-signal.ts.
 */
import type { BlockInfo } from '../../../lib/api/block-signal';

export type Lang = 'en' | 'hi' | null;

/** The screen's state: no block, a block, or a block whose re-check is running / just failed. */
export type BlockState = {
  block: BlockInfo | null;
  /** A "Try again" request is in flight. */
  checking: boolean;
  /** The last re-check: 'still' = server still says blocked, 'error' = could not reach it. */
  lastCheck: 'still' | 'error' | null;
};

export const NO_BLOCK: BlockState = { block: null, checking: false, lastCheck: null };

export type BlockAction =
  | { type: 'blocked'; block: BlockInfo }
  | { type: 'check_start' }
  | { type: 'check_result'; result: 'ok' | 'blocked' | 'error' }
  | { type: 'clear' };

const sameBlock = (a: BlockInfo, b: BlockInfo): boolean =>
  a.code === b.code &&
  a.message === b.message &&
  a.messageHi === b.messageHi &&
  a.until === b.until &&
  a.support.email === b.support.email &&
  a.support.phone === b.support.phone;

/**
 * Returns the SAME state object when nothing changes, so a burst of identical 403s (every screen
 * fetching at once) does not re-render the app; React bails out on an unchanged reducer result.
 */
export function blockReducer(state: BlockState, a: BlockAction): BlockState {
  switch (a.type) {
    case 'blocked':
      if (state.block && sameBlock(state.block, a.block)) return state;
      // A new/different block resets any stale re-check result but keeps a running check running.
      return { block: a.block, checking: state.checking, lastCheck: state.checking ? state.lastCheck : null };
    case 'check_start':
      if (!state.block || state.checking) return state;
      return { ...state, checking: true, lastCheck: null };
    case 'check_result':
      if (!state.checking) return state;
      if (a.result === 'ok') return NO_BLOCK;
      return { ...state, checking: false, lastCheck: a.result === 'blocked' ? 'still' : 'error' };
    case 'clear':
      return state.block || state.checking || state.lastCheck ? NO_BLOCK : state;
  }
}

/** What a re-check's outcome means. `status` is the HTTP status of a failed call, null when it never arrived. */
export function classifyCheck(outcome: { ok: true } | { ok: false; status: number | null; isBlock: boolean }): 'ok' | 'blocked' | 'error' {
  if (outcome.ok) return 'ok';
  if (outcome.isBlock) return 'blocked';
  // 401: the session is gone (refresh token revoked) -> nothing left to block, they land on login.
  if (outcome.status === 401) return 'ok';
  return 'error';
}

/** messageHi when the app is in Hindi and it is non-empty; otherwise the English message; else the built-in one. */
export function pickBlockMessage(b: Pick<BlockInfo, 'message' | 'messageHi'>, lang: Lang, fallback: string): string {
  const hi = b.messageHi.trim();
  const en = b.message.trim();
  if ((lang ?? 'hi') === 'hi' && hi) return hi;
  return en || fallback;
}

const IST_MS = 5.5 * 3600_000;
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्तू', 'नव', 'दिस'],
};

/** "30 Oct 2026, 6:30 PM" in IST, or '' for null / an unparseable value. No Intl: Hermes' support varies. */
export function formatUntil(iso: string | null, lang: Lang): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + IST_MS);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[lang === 'en' ? 'en' : 'hi'][d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Server-provided support first, then the app's own configured contact. Blank = channel hidden. */
export function pickSupport(
  server: { email: string; phone: string },
  fallback: { email: string; phone: string },
): { email: string; phone: string } {
  return { email: server.email || fallback.email || '', phone: server.phone || fallback.phone || '' };
}

/** A dialable number: digits and a leading +, nothing else (the text comes from a server). */
export const telUrl = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const mailUrl = (email: string): string => `mailto:${email.trim()}`;
/** Plausible address only; the value is server text. */
export const isEmail = (s: string): boolean => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
