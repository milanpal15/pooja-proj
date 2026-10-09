import { publicGet } from './client';

export type Presence = 'offline' | 'online' | 'busy';

export type Astrologer = {
  id: string;
  name: string;
  bio?: string;
  photoUrl?: string | null;
  specialities: string[];
  languages: string[];
  yearsExperience?: number;
  /** Coins per minute. */
  ratePerMin: number;
  presence: Presence;
  /** Only present once real ratings exist. */
  ratingAvg?: number;
  ratingCount?: number;
};

export async function fetchAstrologers(): Promise<Astrologer[]> {
  const { astrologers } = await publicGet<{ astrologers: Astrologer[] }>('/api/astrologers');
  return astrologers ?? [];
}
