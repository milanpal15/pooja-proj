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

/**
 * New uploads accept these extensions only. SVG is served for files stored
 * before this rule (it is in `TYPES`) but is not accepted any more: an SVG can
 * carry script, and the files are served from the API's own origin.
 */
export const UPLOAD_EXTENSIONS = Object.keys(TYPES).filter((e) => e !== 'svg');

const extOf = (name) => (String(name).match(/\.([A-Za-z0-9]{1,8})$/) || [, ''])[1].toLowerCase();

export const uploadAllowed = (originalname) => UPLOAD_EXTENSIONS.includes(extOf(originalname));

/**
 * The content type is decided by the extension, never by what the browser said.
 *
 * It used to trust the reported type whenever it was specific, so `x.png`
 * uploaded as `text/html` was stored — and later served — as HTML, from the same
 * origin as the admin session. An operator with only content rights could plant
 * a page that acts as whichever admin opens it.
 */
function contentType(originalname) {
  return TYPES[extOf(originalname)] || 'application/octet-stream';
}

/** `650f…a1.mp3` → the ObjectId, or null when this is not one of ours. */
export function idOf(name) {
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
      contentType: contentType(originalname),
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
