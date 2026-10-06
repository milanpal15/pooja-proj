/**
 * Move media off the filesystem and into MongoDB.
 *
 *   MONGODB_URI=… node scripts/migrate-media.mjs [--dry-run]
 *
 * Two steps, in this order: every file under UPLOAD_DIR is written to
 * GridFS, then every document in the database that referenced it by its old
 * path is rewritten to the new one. Doing it the other way round would
 * leave rows pointing at files that had not arrived yet.
 *
 * Idempotent. A file already migrated is recognised by `metadata.legacyName`
 * and skipped rather than stored a second time, so running it twice does
 * not double the database.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import 'dotenv/config';
import mongoose from 'mongoose';

import { UPLOAD_DIR } from '../src/content.js';
import { bucket, saveFile } from '../src/files.js';

const DRY = process.argv.includes('--dry-run');
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pooja_admin';

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.mp4': 'video/mp4',
};
const typeOf = (name) => TYPES[(name.match(/\.[^.]+$/) || [''])[0].toLowerCase()] || 'application/octet-stream';

/** Rewrite every `/uploads/<old>` we know about, anywhere in a value. */
function rewrite(value, map) {
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) {
    const next = value.map((v) => rewrite(v, map));
    return next.some((v, i) => v !== value[i]) ? next : value;
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    let changed = false;
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = rewrite(v, map);
      if (next[k] !== v) changed = true;
    }
    return changed ? next : value;
  }
  return value;
}

async function main() {
  await mongoose.connect(URI);
  console.log(`${DRY ? 'DRY RUN — ' : ''}database: ${mongoose.connection.name}`);

  if (!existsSync(UPLOAD_DIR)) {
    console.log(`Nothing to do: ${UPLOAD_DIR} does not exist.`);
    return;
  }

  const names = (await readdir(UPLOAD_DIR, { withFileTypes: true }))
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name);
  console.log(`${names.length} file(s) on disk`);

  // oldUrl -> newUrl
  const map = new Map();
  let stored = 0;
  let skipped = 0;

  for (const name of names) {
    const already = await bucket().find({ 'metadata.legacyName': name }).next();
    if (already) {
      const ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      map.set(`/uploads/${name}`, `/uploads/${already._id}${ext}`);
      skipped++;
      continue;
    }
    if (DRY) {
      // Still map it, to a plausible id, so the rewrite below can be
      // previewed too. Without this a dry run reports "no URLs to
      // rewrite" for exactly the documents it is about to rewrite.
      const ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      map.set(`/uploads/${name}`, `/uploads/${new mongoose.Types.ObjectId()}${ext}`);
      console.log(`  would store ${name}`);
      stored++;
      continue;
    }
    const buffer = await readFile(join(UPLOAD_DIR, name));
    const { url, id } = await saveFile({ buffer, originalname: name, mimetype: typeOf(name) });
    await mongoose.connection.db
      .collection('media.files')
      .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { 'metadata.legacyName': name } });
    map.set(`/uploads/${name}`, url);
    stored++;
  }
  console.log(`stored ${stored}, already present ${skipped}`);

  if (!map.size) {
    console.log('No URLs to rewrite.');
    return;
  }

  // Every collection, because a file path can live on any content type and
  // enumerating them by hand is how one gets missed.
  let touched = 0;
  const collections = (await mongoose.connection.db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('media.'));

  for (const name of collections) {
    const col = mongoose.connection.db.collection(name);
    for await (const doc of col.find({})) {
      const { _id, ...rest } = doc;
      const next = rewrite(rest, map);
      if (next === rest) continue;
      const changed = Object.fromEntries(
        Object.entries(next).filter(([k, v]) => v !== rest[k]),
      );
      console.log(`  ${name}/${_id}: ${Object.keys(changed).join(', ')}`);
      if (!DRY) await col.updateOne({ _id }, { $set: changed });
      touched++;
    }
  }
  console.log(`${DRY ? 'would rewrite' : 'rewrote'} ${touched} document(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
