import { authedFetch } from './client';

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
  /** Absent on responses from an older API — treat as `devotee`. */
  role?: 'devotee' | 'astrologer';
  astrologer?: { id: string; name: string } | null;
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

/* ───────────────────────────────────────────────────── saved temples ── */

export async function fetchSavedTemples(): Promise<string[]> {
  const { slugs } = (await authedFetch('/api/auth/saved-temples')) as { slugs: string[] };
  return slugs ?? [];
}

export async function putSavedTemples(slugs: string[]): Promise<string[]> {
  const res = (await authedFetch('/api/auth/saved-temples', {
    method: 'PUT',
    body: JSON.stringify({ slugs }),
  })) as { slugs: string[] };
  return res.slugs ?? slugs;
}
