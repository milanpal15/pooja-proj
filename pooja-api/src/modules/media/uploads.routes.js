import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

import { asyncRouter } from '../../lib/async-handler.js';
import { bucket, idOf } from './files.js';

/** `bytes=100-200` against a known length → absolute, inclusive offsets. */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;

  // `bytes=-500` means the LAST 500 bytes, not "up to 500".
  let start = rawStart === '' ? size - Number(rawEnd) : Number(rawStart);
  let end = rawStart === '' || rawEnd === '' ? size - 1 : Number(rawEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end) return null;
  return { start, end };
}

/**
 * Serves `/uploads/...`.
 *
 * Range requests are not optional here. Android's `MediaPlayer` — which is
 * what rings the alarm tone — and `expo-audio`'s seek both ask for byte
 * ranges, and a server that answers 200 with the whole body to every
 * request makes seeking in a long aarti download it from the start again.
 */
export const uploads = asyncRouter();

uploads.get('/:file', async (req, res) => {
  // Uploaded files are served from the API's own origin, which also holds the
  // admin session. `nosniff` stops a browser reinterpreting a file as HTML, and
  // `sandbox` strips the origin and the right to run script from anything that
  // is opened as a page (an old SVG, say). Images and audio are unaffected.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox');

  const id = idOf(req.params.file);

  if (!id) return serveLegacy(req, res);

  let file;
  try {
    file = await bucket().find({ _id: id }).next();
  } catch {
    return res.status(503).json({ error: 'media store unavailable' });
  }
  if (!file) return serveLegacy(req, res);

  const size = file.length;
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  // A stored file never changes — a re-upload gets a new id — so this can
  // be cached hard. It is the difference between the sanctum loading from
  // disk and re-downloading every murti on every launch.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', `"${id}"`);

  if (req.headers['if-none-match'] === `"${id}"`) return res.status(304).end();

  const range = req.headers.range ? parseRange(req.headers.range, size) : null;
  if (req.headers.range && !range) {
    res.setHeader('Content-Range', `bytes */${size}`);
    return res.status(416).end();
  }

  const { start, end } = range ?? { start: 0, end: size - 1 };
  res.setHeader('Content-Length', end - start + 1);
  if (range) {
    res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  if (req.method === 'HEAD') return res.end();

  // `end` is exclusive in the driver and inclusive in the HTTP header.
  const stream = bucket().openDownloadStream(id, { start, end: end + 1 });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

/**
 * Anything written before media moved into the database.
 *
 * A local checkout still has files under `uploads/`, and their rows still
 * name them. Falling back here means the migration is not a flag day — run
 * `npm run migrate:media` when convenient, not before the next deploy.
 */
let legacyDir = null;
export function setLegacyDir(dir) {
  legacyDir = dir;
}

function serveLegacy(req, res) {
  // `..` in the path would otherwise read anything the process can.
  const name = req.params.file;
  if (!legacyDir || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return res.status(404).json({ error: 'not found' });
  }
  const path = join(legacyDir, name);
  if (!existsSync(path)) return res.status(404).json({ error: 'not found' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  createReadStream(path).on('error', () => res.destroy()).pipe(res);
}
