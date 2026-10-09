import { ApiError, post, publicFetch } from './client';

/** Contract: docs/LIVE_DARSHAN.md. Values the system cannot know arrive as null — never invent one. */

export type LiveState = 'live' | 'upcoming' | 'offline';

export type LiveAartiRef = { name: string; nameHi?: string };
export type LiveNextAarti = { name: string; nameHi?: string; time: string };

export type LiveCard = {
  slug: string;
  templeSlug: string;
  templeName: string;
  templeNameHi?: string;
  place: string;
  categorySlug: string;
  state: LiveState;
  /** False when "live" is only the operator's switch (the source could not be checked). */
  verified: boolean;
  currentAarti: LiveAartiRef | null;
  startedAt: string | null;
  viewers: number | null;
  nextAarti: LiveNextAarti | null;
  cover: string;
  sourceType: 'youtube' | 'hls';
};

export type LiveCategory = { slug: string; name: string; nameHi?: string };

export type LiveScheduleItem = {
  streamSlug: string;
  templeName: string;
  name: string;
  nameHi?: string;
  time: string;
  isNext: boolean;
};

export type LiveList = {
  categories: LiveCategory[];
  streams: LiveCard[];
  schedule: LiveScheduleItem[];
};

export type LiveAartiToday = {
  name: string;
  nameHi?: string;
  time: string;
  status: 'live' | 'done' | 'upcoming';
};

export type LiveDetail = LiveCard & {
  /** Present only while the stream is live. */
  url?: string;
  jaiText?: string;
  jaiTextHi?: string;
  jaiCount: number | null;
  aartisToday: LiveAartiToday[];
  temple: { slug: string; name: string; about?: string; place?: string; lat?: number; lng?: number };
  chadhava: { slug: string; title: string; fromCoins: number } | null;
  pooja: { slug: string; title: string; fromCoins: number } | null;
  more: LiveCard[];
};

/** The whole list. Rejects when the API is unreachable — callers show an empty state. */
export async function fetchLive(): Promise<LiveList> {
  const res = await publicFetch<Partial<LiveList>>('/api/live');
  return {
    categories: res.categories ?? [],
    streams: res.streams ?? [],
    schedule: res.schedule ?? [],
  };
}

export async function fetchLiveStream(slug: string): Promise<LiveDetail> {
  const { stream } = await publicFetch<{ stream: LiveDetail }>(`/api/live/${encodeURIComponent(slug)}`);
  return stream;
}

/**
 * One "Jai" tap. Returns the new count, or null when the tap simply did not count: `429 too_fast`
 * (one per minute) and `409 no_aarti` are not errors the devotee needs to hear about.
 */
export async function sendLiveJai(slug: string): Promise<number | null> {
  try {
    const res = (await post(`/api/live/${encodeURIComponent(slug)}/jai`)) as { jaiCount?: number };
    return typeof res.jaiCount === 'number' ? res.jaiCount : null;
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'too_fast' || e.code === 'no_aarti' || e.status === 429 || e.status === 409)) {
      return null;
    }
    throw e;
  }
}
