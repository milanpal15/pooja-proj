import { authedFetch, post } from './client';

export type CallStatus = 'requested' | 'connected' | 'ended';
export type CallEndReason =
  | 'completed'
  | 'declined'
  | 'missed'
  | 'cancelled'
  | 'out_of_coins'
  | 'failed'
  | 'admin';

export type RtcCredentials = {
  provider: 'agora' | 'mock' | string;
  appId?: string;
  channel: string;
  token?: string;
  uid?: number | string;
};

export type CallView = {
  id: string;
  status: CallStatus;
  endReason?: CallEndReason | null;
  astrologer: { id: string; name: string; photoUrl?: string | null };
  devotee: { name: string };
  ratePerMin: number;
  minutesBilled: number;
  coinsCharged: number;
  /** The viewer's own wallet balance (devotee only). */
  balance?: number;
  secondsToNextCharge?: number | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  /** At most one minute of balance remains. */
  lowBalance?: boolean;
  rtc?: RtcCredentials;
  /** Present once the devotee rated it. */
  rating?: number | null;
};

export async function createCall(astrologerId: string, requestId: string): Promise<CallView> {
  const { call } = (await post('/api/calls', { astrologerId, requestId })) as { call: CallView };
  return call;
}
export async function fetchCall(id: string): Promise<CallView> {
  const { call } = (await authedFetch(`/api/calls/${id}`)) as { call: CallView };
  return call;
}
export const cancelCall = (id: string) => post(`/api/calls/${id}/cancel`);
export const endCall = (id: string) => post(`/api/calls/${id}/end`);
export const acceptCall = (id: string) => post(`/api/calls/${id}/accept`);
export const declineCall = (id: string) => post(`/api/calls/${id}/decline`);
export const rateCall = (id: string, rating: number) =>
  post(`/api/calls/${id}/rating`, { rating });
