import { authedFetch, post } from './client';

/** Hand the phone's Firebase Cloud Messaging token to the backend so it can reach this account. Idempotent. */
export const registerPushToken = (token: string, platform: 'android' | 'ios') => post('/api/push/register', { token, platform });

/** Take it back at sign-out, so the next person on this phone does not receive this account's notifications. */
export async function unregisterPushToken(token: string): Promise<void> {
  await authedFetch('/api/push/register', { method: 'DELETE', body: JSON.stringify({ token }) }, 4_000);
}
