import { HttpError } from '../../../lib/http-error.js';
import { normalizeStreamUrl } from '../../../lib/stream-url.js';
import { Temple } from '../models/temple.model.js';

/** Clean the live-darshan address (a pasted YouTube embed becomes a plain link); refuse nonsense. */
export function prepareTemple(body = {}) {
  if (body.liveUrl === undefined) return body;
  const clean = normalizeStreamUrl(body.liveUrl);
  if (clean === null) {
    throw new HttpError(
      400,
      'bad_stream_url',
      'Live darshan URL: paste a YouTube link or embed code, or an https .m3u8 / .mp4 address.',
    );
  }
  return { ...body, liveUrl: clean };
}

export default { path: '/temples', name: 'Temple', Model: Temple, prepare: prepareTemple };
