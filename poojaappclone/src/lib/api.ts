import { ADMIN_API } from '@/constants/config';
import { getIdToken } from '@/lib/firebase-auth';

/** Raised when the backend rejects the caller; `status` drives what the UI does. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Call the admin backend with the devotee's Firebase ID token attached.
 *
 * On a 401 it retries once with a force-refreshed token, which covers the
 * ordinary case of a token that expired while the app was backgrounded. A
 * second 401 is real — the caller should sign out.
 *
 * Unlike the flags/content fetches, these calls are NOT best-effort: a failure
 * here means the account did not sync, and swallowing it is how you end up
 * with a devotee signed into an app the backend has never heard of.
 */
export async function authedFetch(path: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const send = async (force: boolean) => {
    const token = await getIdToken(force);
    if (!token) throw new ApiError(401, 'not signed in');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${ADMIN_API}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await send(false);
  if (res.status === 401) res = await send(true);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string; detail?: string });
    throw new ApiError(res.status, body.detail || body.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export type Profile = {
  id: string;
  uid: string;
  name: string;
  contact: string;
  method: string;
  email: string | null;
  /** True only when the provider supplied the address, not the devotee. */
  emailVerified: boolean;
  phone: string | null;
  photoUrl: string | null;
  bio: string;
  gender: Gender | null;
  /** YYYY-MM-DD. A calendar date, not a timestamp. */
  dob: string | null;
  blocked: boolean;
};

/** `prefer_not_to_say` is a real answer here, not an absent one. */
export type Gender = 'female' | 'male' | 'other' | 'prefer_not_to_say';

/** Create-or-refresh this devotee's row on the backend. */
export function syncProfile(
  body: {
    name?: string;
    bio?: string;
    deviceId?: string;
    gender?: Gender;
    /** YYYY-MM-DD. */
    dob?: string;
    /** Only honoured for phone sign-ins; a Google address always wins. */
    email?: string;
  },
) {
  return authedFetch('/api/auth/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<Profile>;
}

export function fetchProfile() {
  return authedFetch('/api/auth/me') as Promise<Profile>;
}

export function updateProfile(body: {
  name?: string;
  bio?: string;
  gender?: Gender;
  dob?: string;
  email?: string;
}) {
  return authedFetch('/api/auth/me', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as Promise<Profile>;
}
