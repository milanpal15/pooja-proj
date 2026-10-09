import type { Astrologer, Presence } from './astrologers';
import { authedFetch, post } from './client';
import type { CallView } from './calls';

export type CallRow = {
  id: string;
  startedAt: string;
  devoteeName: string;
  astrologerName: string;
  durationSec: number;
  coins: number;
  /** `endReason` or `status`. */
  endReason?: string;
  status?: string;
  /** Astrologer's own share, when the API includes it. */
  earnedPaise?: number;
};

export type EarningsBucket = { earnedPaise: number; calls: number; minutes: number };
export type Earnings = {
  month: EarningsBucket;
  today: EarningsBucket;
  paidPaise: number;
  duePaise: number;
  payouts: { amountPaise: number; paidAt: string; reference?: string }[];
};

/* — astrologer-side (`/api/astrologer/me/*`) — */

export async function setMyPresence(online: boolean): Promise<Presence> {
  const r = (await authedFetch('/api/astrologer/me/presence', {
    method: 'PUT',
    body: JSON.stringify({ online }),
  })) as { presence: Presence };
  return r.presence;
}
export const sendHeartbeat = () => post('/api/astrologer/me/heartbeat');
export async function fetchIncomingCall(): Promise<CallView | null> {
  const { call } = (await authedFetch('/api/astrologer/me/incoming')) as { call: CallView | null };
  return call ?? null;
}
export async function fetchMyCalls(limit = 20, before?: string): Promise<CallRow[]> {
  const q = `?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
  const { calls } = (await authedFetch(`/api/astrologer/me/calls${q}`)) as { calls: CallRow[] };
  return calls ?? [];
}
export function fetchMyEarnings() {
  return authedFetch('/api/astrologer/me/earnings') as Promise<Earnings>;
}
export async function fetchAstrologerMe() {
  const { astrologer } = (await authedFetch('/api/astrologer/me')) as {
    astrologer: Astrologer & { presence: Presence };
  };
  return astrologer;
}
