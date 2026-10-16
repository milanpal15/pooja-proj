import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateManifest, matchEntity, rowsOf, rowId, passwordFromFile, usernameFromFile, parseArgs, TARGETS } from './apply-media-pack.mjs';

const good = (over = {}) => ({
  entity: 'deity', slug: 'shiva', field: 'imageUrl', file: 'deity-shiva.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg', title: 'X', author: 'A', licenseShortName: 'Public domain',
  licenseUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg', retrievedAt: '2026-10-16', width: 800, height: 800, bytes: 100000, ...over,
});

test('a good entry validates', () => assert.deepEqual(validateManifest([good()]), []));
test('empty / non-array manifest is refused', () => {
  assert.ok(validateManifest([]).length);
  assert.ok(validateManifest({}).length);
});
test('licence allow-list refuses CC BY-SA and GFDL', () => {
  assert.match(validateManifest([good({ licenseShortName: 'CC BY-SA 4.0' })]).join(), /not allowed/);
  assert.match(validateManifest([good({ licenseShortName: 'GFDL' })]).join(), /not allowed/);
  assert.deepEqual(validateManifest([good({ licenseShortName: 'CC0' })]), []);
});
test('required fields and field name per entity', () => {
  assert.match(validateManifest([good({ author: '' })]).join(), /missing author/);
  assert.match(validateManifest([good({ field: 'image' })]).join(), /field must be "imageUrl"/);
  assert.match(validateManifest([good({ entity: 'nope' })]).join(), /unknown entity/);
  assert.deepEqual(validateManifest([good({ entity: 'hero', field: 'image' })]), []);
  assert.deepEqual(validateManifest([good({ entity: 'pooja', field: 'gallery' })]), []);
  assert.deepEqual(validateManifest([good({ entity: 'event', field: 'cover' })]), []);
});
test('size limits: file, short side, whole pack, reuse', () => {
  assert.match(validateManifest([good({ bytes: 300 * 1024 })]).join(), /exceeds/);
  assert.match(validateManifest([good({ width: 300 })]).join(), /too small/);
  const many = Array.from({ length: 40 }, (_, i) => good({ slug: 's' + i, file: `f${i}.jpg`, sourceUrl: `https://commons.wikimedia.org/wiki/File:${i}.jpg`, bytes: 240 * 1024 }));
  assert.match(validateManifest(many).join(), /pack is/);
  const thrice = [1, 2, 3].map((i) => good({ slug: 's' + i, file: `f${i}.jpg` }));
  assert.match(validateManifest(thrice).join(), /used for 3 entities/);
});
test('source must be a Commons file page; duplicates and odd filenames refused', () => {
  assert.match(validateManifest([good({ sourceUrl: 'https://pngtree.com/x' })]).join(), /Commons/);
  assert.match(validateManifest([good(), good({ file: 'other.jpg' })]).join(), /duplicate/);
  assert.match(validateManifest([good({ file: '../x.jpg' })]).join(), /plain .jpg/);
});
test('matching by slug and list shapes', () => {
  const rows = [{ _id: 'a', slug: 'x' }, { id: 'b', slug: 'y' }];
  assert.equal(rowId(matchEntity(rows, 'y')), 'b');
  assert.equal(rowId(matchEntity(rows, 'x')), 'a');
  assert.equal(matchEntity(rows, 'z'), null);
  assert.equal(matchEntity(undefined, 'z'), null);
  assert.deepEqual(rowsOf({ poojas: rows }, 'poojas'), rows);
  assert.deepEqual(rowsOf(rows), rows);
  assert.deepEqual(rowsOf({}), []);
});
test('"already set" detection per entity', () => {
  assert.equal(TARGETS.deity.has({ imageUrl: '/uploads/a.jpg' }), true);
  assert.equal(TARGETS.deity.has({}), false);
  assert.equal(TARGETS.pooja.has({ gallery: [] }), false);
  assert.equal(TARGETS.pooja.has({ gallery: ['/uploads/a.jpg'] }), true);
  assert.deepEqual(TARGETS.pooja.set('/u/a.jpg'), { gallery: ['/u/a.jpg'] });
});
test('credentials parsing never needs the value printed', () => {
  assert.equal(passwordFromFile('# c\nADMIN_USERNAME=admin\nADMIN_PASSWORD=pw123\nOTHER=1\n'), 'pw123');
  assert.equal(usernameFromFile('ADMIN_USERNAME=bob\n'), 'bob');
  assert.equal(passwordFromFile('justapassword\n'), 'justapassword');
  assert.equal(passwordFromFile('FOO=bar\n'), '');
});
test('argument parsing', () => {
  assert.deepEqual(parseArgs(['--admin', 'http://x', '--dry-run', '--password-file', 'f']), { dryRun: true, overwrite: false, allowMissing: false, admin: 'http://x', passwordFile: 'f' });
  assert.throws(() => parseArgs(['--bogus']));
});
test('the committed pack is valid and its files exist', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'media-pack');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual(validateManifest(manifest), []);
  for (const m of manifest) assert.equal(fs.statSync(path.join(dir, m.file)).size, m.bytes, m.file);
});
