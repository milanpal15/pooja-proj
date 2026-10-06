import { asyncRouter } from './async.js';

/**
 * Uploaded media, stored in MongoDB.
 *
 * Artwork, alert tones and bhajan recordings used to be written to the
 * container's filesystem. That filesystem does not survive a deploy or a
 * spin-down, and the free plan cannot mount a disk — so every release threw
 * the temple's media away and left the dashboard's rows pointing at files
 * that no longer existed. The app ships no media of its own any more, so
 * that was the whole sanctum going blank and silent.
 *
 * GridFS keeps them next to the documents that reference them: one backup,
 * one connection string, nothing to mount. It chunks, so a long aarti is
 * not bound by the 16MB document limit the way an inline `Buffer` would be.
 *
 * The URL shape is deliberately unchanged — still host-relative
 * `/uploads/<something>` — so every row already in the database keeps
 * resolving and neither client needed a line changed.
 */
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

import mongoose from 'mongoose';

const { GridFSBucket, ObjectId } = mongoose.mongo;

const BUCKET = 'media';

/**
 * The bucket, created on first use.
 *
 * Not at import time: the connection does not exist yet when this module is
 * loaded, and binding to `mongoose.connection.db` then captures undefined.
 */
let cached = null;
export function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection — cannot read or write media');
  if (!cached || cached.db !== db) {
    cached = { db, bucket: new GridFSBucket(db, { bucketName: BUCKET }) };
  }
  return cached.bucket;
}

/**
 * Content types we can work out from the file name.
 *
 * Needed because the type the browser reports is not reliable, and
 * `application/octet-stream` is not a harmless default here: Android's
 * MediaPlayer picks a decoder from Content-Type before it looks at
 * anything else, so an alarm tone served as octet-stream can simply fail
 * to play with nothing in the log.
 */
const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  ogg: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac', mp4: 'video/mp4',
};

/** The reported type, unless the extension knows better. */
function contentType(originalname, reported) {
  const ext = (String(originalname).match(/\.([A-Za-z0-9]{1,8})$/) || [, ''])[1].toLowerCase();
  const known = TYPES[ext];
  // Trust the browser only when it said something specific.
  if (reported && reported !== 'application/octet-stream') return reported;
  return known || reported || 'application/octet-stream';
}

/** `650f…a1.mp3` → the ObjectId, or null when this is not one of ours. */
function idOf(name) {
  const base = String(name).split('.')[0];
  return ObjectId.isValid(base) && String(new ObjectId(base)) === base ? new ObjectId(base) : null;
}

/**
 * Store a file and return the URL to put in a content row.
 *
 * The extension is kept on the end of the URL even though the id alone
 * would find the file: some players pick a decoder from the path before
 * they look at `Content-Type`, and a bare id makes an mp3 look like no
 * format at all.
 */
export async function saveFile({ buffer, originalname, mimetype }) {
  const ext = (originalname.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
  const id = new ObjectId();
  await new Promise((resolve, reject) => {
    const stream = bucket().openUploadStreamWithId(id, originalname || String(id), {
      contentType: contentType(originalname, mimetype),
      metadata: { originalname, uploadedAt: new Date() },
    });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(buffer);
  });
  return { id: String(id), url: `/uploads/${id}${ext}` };
}

/** Remove a stored file, by the URL that was handed out for it. */
export async function deleteFile(url) {
  const id = idOf(String(url).replace(/^.*\/uploads\//, ''));
  if (!id) return false;
  try {
    await bucket().delete(id);
    return true;
  } catch {
    // Already gone. Deleting something twice is not an error worth raising.
    return false;
  }
}

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
