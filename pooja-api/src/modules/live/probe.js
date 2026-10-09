/**
 * Is this feed really broadcasting? (docs/LIVE_DARSHAN.md "Probe".)
 *
 * HLS: fetch the manifest. YouTube: the official Data API only — never the watch page — and with no
 * `YOUTUBE_API_KEY` the answer is "unknown" (`broadcasting: null`), which the dashboard flags as unverified.
 */
import { youTubeId } from '../../lib/stream-url.js';
import { LiveStream } from './live.model.js';

export const NO_KEY_NOTE = 'YOUTUBE_API_KEY not set — live status is not verified';
const TIMEOUT_MS = 8000;
const EVERY_MS = 60_000;

const unknown = (probeNote) => ({ broadcasting: null, viewers: null, startedAt: null, probeNote });

/** An operator-supplied URL is fetched by the server, so refuse addresses that point inward. */
export function isInternalHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || h.startsWith('::ffff:')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function firstBytes(res, n = 512) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, n);
  let out = '';
  const dec = new TextDecoder();
  try {
    while (out.length < n) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return out;
}

export async function probeHls(url, { fetchImpl = fetch } = {}) {
  const result = (broadcasting, probeNote = '') => ({ broadcasting, viewers: null, startedAt: null, probeNote });
  try {
    let target = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      if (target.protocol !== 'https:' || isInternalHost(target.hostname)) return result(false, 'Address not allowed');
      const res = await fetchImpl(target, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: '*/*' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        res.body?.cancel?.().catch(() => {});
        target = new URL(res.headers.get('location'), target);
        continue;
      }
      if (res.status !== 200) {
        res.body?.cancel?.().catch(() => {});
        return result(false, `HTTP ${res.status}`);
      }
      if (/\.mp4$/i.test(target.pathname)) {
        const type = res.headers.get('content-type') || '';
        res.body?.cancel?.().catch(() => {});
        return type.startsWith('video/') ? result(true) : result(false, 'Not a video');
      }
      const head = await firstBytes(res);
      return head.trimStart().startsWith('#EXTM3U') ? result(true) : result(false, 'Not an HLS manifest');
    }
    return result(false, 'Too many redirects');
  } catch (e) {
    return result(false, e?.name === 'TimeoutError' ? 'Timed out' : 'Unreachable');
  }
}

/** One Data API call for up to 50 video ids → Map(id → probe result). `null` when the call itself failed. */
export async function probeYoutubeIds(ids, { apiKey, fetchImpl = fetch } = {}) {
  const out = new Map();
  if (!apiKey) {
    for (const id of ids) out.set(id, unknown(NO_KEY_NOTE));
    return out;
  }
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const api = new URL('https://www.googleapis.com/youtube/v3/videos');
    api.search = new URLSearchParams({ part: 'liveStreamingDetails,snippet', id: chunk.join(','), key: apiKey }).toString();
    let items = null;
    try {
      const res = await fetchImpl(api, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) items = (await res.json()).items ?? [];
      else for (const id of chunk) out.set(id, unknown(`YouTube API error ${res.status} — live status is not verified`));
    } catch {
      for (const id of chunk) out.set(id, unknown('YouTube API unreachable — live status is not verified'));
    }
    if (!items) continue;
    const byId = new Map(items.map((v) => [v.id, v]));
    for (const id of chunk) {
      const v = byId.get(id);
      if (!v) { out.set(id, { broadcasting: false, viewers: null, startedAt: null, probeNote: 'Video not found' }); continue; }
      const live = v.snippet?.liveBroadcastContent === 'live';
      const details = v.liveStreamingDetails ?? {};
      const viewers = live && details.concurrentViewers !== undefined ? Number(details.concurrentViewers) : null;
      out.set(id, {
        broadcasting: live,
        viewers: Number.isFinite(viewers) ? viewers : null,
        startedAt: live && details.actualStartTime ? new Date(details.actualStartTime) : null,
        probeNote: '',
      });
    }
  }
  return out;
}

export async function probeSource({ sourceType, url }, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.YOUTUBE_API_KEY;
  if (sourceType === 'youtube') {
    const id = youTubeId(url);
    if (!id) return { broadcasting: false, viewers: null, startedAt: null, probeNote: 'Not a YouTube link' };
    return (await probeYoutubeIds([id], { ...opts, apiKey })).get(id);
  }
  return probeHls(url, opts);
}

let running = false;

/** Probe every enabled stream and cache the result. Safe to call concurrently (a second call is a no-op). */
export async function probeAll(opts = {}) {
  if (running) return 0;
  running = true;
  try {
    const apiKey = opts.apiKey ?? process.env.YOUTUBE_API_KEY;
    const streams = await LiveStream.find({ enabled: true }).select('_id sourceType url').lean();
    const yt = streams.filter((s) => s.sourceType === 'youtube');
    const ytResults = await probeYoutubeIds([...new Set(yt.map((s) => youTubeId(s.url)).filter(Boolean))], { ...opts, apiKey });
    const others = streams.filter((s) => s.sourceType !== 'youtube');
    const hlsResults = new Map();
    for (let i = 0; i < others.length; i += 5) {
      await Promise.all(others.slice(i, i + 5).map(async (s) => hlsResults.set(String(s._id), await probeHls(s.url, opts))));
    }
    const checkedAt = new Date();
    const ops = streams.map((s) => {
      const r = s.sourceType === 'youtube' ? ytResults.get(youTubeId(s.url)) ?? unknown('Not a YouTube link') : hlsResults.get(String(s._id));
      return { updateOne: { filter: { _id: s._id, url: s.url }, update: { $set: { ...r, checkedAt } } } };
    });
    if (ops.length) await LiveStream.bulkWrite(ops);
    return ops.length;
  } finally {
    running = false;
  }
}

let timer = null;

/** Start the background job. Only `start()` in index.js calls this, so tests never run it. */
export function startProbe({ everyMs = EVERY_MS } = {}) {
  if (timer) return timer;
  const tick = () => probeAll().catch((e) => console.error('✗ live probe failed:', e.message));
  timer = setInterval(tick, everyMs);
  timer.unref?.();
  setTimeout(tick, 3000).unref?.();
  return timer;
}

/** After an operator saves a stream, check it now rather than in up to a minute. No-op unless the job is running. */
export function probeSoon() {
  if (timer) probeAll().catch(() => {});
}
