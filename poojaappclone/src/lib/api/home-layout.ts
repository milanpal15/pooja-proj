import { ADMIN_API } from '@/constants/config';

import { ApiError } from './client';

/** Contract: docs/HOME_LAYOUT.md §4. */
export type HomeLayoutResponse =
  | { notModified: true }
  /** `body` is deliberately unvalidated here — `parseLayout` (features/home) is the one gate. */
  | { notModified: false; body: unknown; etag: string | null };

/**
 * `GET /api/home?lang=` — the published Home layout. Public. Send the cached
 * `ETag` as `If-None-Match`: a 304 means "keep what you have". Rejects when the
 * API is unreachable or answers an error; the caller keeps its cache.
 */
export async function fetchHomeLayout(lang: 'en' | 'hi', etag?: string | null, timeoutMs = 8_000): Promise<HomeLayoutResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ADMIN_API}/api/home?lang=${lang}`, {
      signal: controller.signal,
      headers: etag ? { 'If-None-Match': etag } : undefined,
    });
    if (res.status === 304) return { notModified: true };
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
    return { notModified: false, body: await res.json(), etag: res.headers.get('ETag') };
  } finally {
    clearTimeout(timer);
  }
}
