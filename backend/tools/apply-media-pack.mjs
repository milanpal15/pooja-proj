#!/usr/bin/env node
/**
 * Applies backend/tools/media-pack/ to a running stack through the ADMIN API
 * (the same calls the dashboard makes). No dependencies; needs Node >= 20.
 *
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=... \
 *     node backend/tools/apply-media-pack.mjs --admin http://127.0.0.1:4511 [--dry-run] [--overwrite]
 *   node backend/tools/apply-media-pack.mjs --admin http://127.0.0.1:4611 --password-file ~/.bhakti-tester/secrets.env
 *
 * Flags: --allow-missing (an absent slug is skipped, not a failure)  --admin <url>  --username <u>  --password-file <path>  --dry-run  --overwrite  --pack <dir>
 *
 * Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD (or the password file: a KEY=value file with
 * ADMIN_PASSWORD=..., or a file holding only the password). They are never printed.
 *
 * Per entity it uploads the file (POST /api/content/upload -> { url }) then sets the image field:
 *   deity / temple -> PUT /api/content/<deities|temples>/:id   { imageUrl }
 *   hero           -> PUT /api/content/hero/:id                { image }
 *   pooja          -> PUT /api/admin/poojas/:id                { gallery: [url] }   (the first gallery picture is the banner)
 *   event          -> PUT /api/admin/events/:id                { cover }
 * An entity whose field is already set is skipped unless --overwrite. A file is uploaded only when it will be used.
 * Re-uploading is deliberate: files are immutable in GridFS and there is no safe way to know an old upload is identical.
 * Exit code 1 when any entity fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENTITIES = ['deity', 'temple', 'hero', 'pooja', 'event'];
/** Licences the pack may contain. Anything else (CC BY, CC BY-SA, GFDL, "free screenshot"...) is refused. */
export const ALLOWED_LICENSES = ['Public domain', 'CC0', 'PD-old', 'PD-India', 'PD-US', 'PD-author', 'PDM'];
export const MAX_FILE_BYTES = 250 * 1024;
export const MAX_PACK_BYTES = 8 * 1024 * 1024;
export const MIN_SHORT_SIDE = 400;
const REQUIRED = ['entity', 'slug', 'field', 'file', 'sourceUrl', 'title', 'author', 'licenseShortName', 'licenseUrl', 'retrievedAt', 'width', 'height', 'bytes'];

/** Where each entity's image lives: the admin route and the field the app reads. */
export const TARGETS = {
  deity: { list: '/api/content/deities', item: (id) => `/api/content/deities/${id}`, field: 'imageUrl', set: (url) => ({ imageUrl: url }), has: (d) => !!d.imageUrl },
  temple: { list: '/api/content/temples', item: (id) => `/api/content/temples/${id}`, field: 'imageUrl', set: (url) => ({ imageUrl: url }), has: (d) => !!d.imageUrl },
  hero: { list: '/api/content/hero', item: (id) => `/api/content/hero/${id}`, field: 'image', set: (url) => ({ image: url }), has: (d) => !!d.image },
  pooja: { list: '/api/admin/poojas', item: (id) => `/api/admin/poojas/${id}`, field: 'gallery', set: (url) => ({ gallery: [url] }), has: (d) => Array.isArray(d.gallery) && d.gallery.length > 0, key: 'poojas' },
  event: { list: '/api/admin/events', item: (id) => `/api/admin/events/${id}`, field: 'cover', set: (url) => ({ cover: url }), has: (d) => !!d.cover, key: 'events' },
};

/** Problems with a manifest (array of strings; empty = valid). Pure. */
export function validateManifest(manifest) {
  const errs = [];
  if (!Array.isArray(manifest) || manifest.length === 0) return ['manifest must be a non-empty array'];
  const seen = new Set();
  let total = 0;
  manifest.forEach((m, i) => {
    const at = `#${i} ${m?.entity}/${m?.slug}`;
    for (const k of REQUIRED) if (m?.[k] === undefined || m?.[k] === null || m?.[k] === '') errs.push(`${at}: missing ${k}`);
    if (!m) return;
    if (!ENTITIES.includes(m.entity)) errs.push(`${at}: unknown entity`);
    else if (TARGETS[m.entity].field !== m.field) errs.push(`${at}: field must be "${TARGETS[m.entity].field}"`);
    if (!ALLOWED_LICENSES.includes(m.licenseShortName)) errs.push(`${at}: licence "${m.licenseShortName}" is not allowed`);
    if (m.sourceUrl && !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(m.sourceUrl)) errs.push(`${at}: sourceUrl must be a Commons file page`);
    if (typeof m.file === 'string' && (!/^[\w.-]+\.jpg$/.test(m.file))) errs.push(`${at}: file must be a plain .jpg name`);
    if (typeof m.bytes === 'number') { total += m.bytes; if (m.bytes > MAX_FILE_BYTES) errs.push(`${at}: ${m.bytes} bytes exceeds ${MAX_FILE_BYTES}`); }
    if (typeof m.width === 'number' && typeof m.height === 'number' && Math.min(m.width, m.height) < MIN_SHORT_SIDE) errs.push(`${at}: image too small`);
    const key = `${m.entity}/${m.slug}`;
    if (seen.has(key)) errs.push(`${at}: duplicate entity+slug`);
    seen.add(key);
  });
  if (total > MAX_PACK_BYTES) errs.push(`pack is ${total} bytes, over ${MAX_PACK_BYTES}`);
  const perFile = new Map();
  for (const m of manifest) if (m?.sourceUrl) perFile.set(m.sourceUrl, (perFile.get(m.sourceUrl) || 0) + 1);
  for (const [u, n] of perFile) if (n > 2) errs.push(`${u} is used for ${n} entities (max 2)`);
  return errs;
}

/** Find the row for a manifest entry by slug (rows from a list response). Pure. */
export function matchEntity(rows, slug) {
  return (Array.isArray(rows) ? rows : []).find((r) => r && r.slug === slug) || null;
}
export const rowId = (row) => row?._id ?? row?.id;
/** The array of rows in a list response: bare array, or { <key>: [...] }. */
export function rowsOf(body, key) {
  if (Array.isArray(body)) return body;
  if (key && Array.isArray(body?.[key])) return body[key];
  const first = body && Object.values(body).find(Array.isArray);
  return first || [];
}

/** Read a password from a KEY=value file (ADMIN_PASSWORD) or a bare password file. Never logged. */
export function passwordFromFile(text) {
  const m = text.match(/^\s*ADMIN_PASSWORD\s*=\s*(.*)\s*$/m);
  if (m) return m[1].replace(/^["']|["']$/g, '');
  if (/^\s*[A-Z_]+=/m.test(text)) return '';
  return text.trim();
}
export function usernameFromFile(text) {
  const m = text.match(/^\s*ADMIN_USERNAME\s*=\s*(.*)\s*$/m);
  return m ? m[1].replace(/^["']|["']$/g, '') : '';
}

export function parseArgs(argv) {
  const o = { dryRun: false, overwrite: false, allowMissing: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--overwrite') o.overwrite = true;
    else if (a === '--allow-missing') o.allowMissing = true;
    else if (['--admin', '--username', '--password-file', '--pack'].includes(a)) o[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const o = parseArgs(process.argv.slice(2));
  if (!o.admin) throw new Error('--admin <url> is required');
  const base = o.admin.replace(/\/+$/, '');
  const pack = path.resolve(o.pack || path.join(here, 'media-pack'));
  const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json'), 'utf8'));
  const bad = validateManifest(manifest);
  for (const m of manifest) if (!bad.length && !fs.existsSync(path.join(pack, m.file))) bad.push(`missing file ${m.file}`);
  if (bad.length) { console.error('Manifest invalid:\n - ' + bad.join('\n - ')); process.exit(2); }

  let username = o.username || process.env.ADMIN_USERNAME || '';
  let password = process.env.ADMIN_PASSWORD || '';
  if (o.passwordFile) {
    const text = fs.readFileSync(o.passwordFile.replace(/^~(?=\/)/, process.env.HOME || ''), 'utf8');
    password = passwordFromFile(text) || password;
    username = username || usernameFromFile(text);
  }
  username = username || 'admin';
  if (!password) throw new Error('no password: set ADMIN_PASSWORD or pass --password-file');

  let cookie = '';
  const call = async (method, url, body, extra = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), ...extra };
    const init = { method, headers };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.body = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const res = await fetch(base + url, init);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { res, json, text };
  };

  const login = await call('POST', '/api/admin/login', { username, password });
  if (!login.res.ok) throw new Error(`login failed: HTTP ${login.res.status}`);
  cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('login gave no session cookie');
  console.log(`signed in to ${base} as ${username}${o.dryRun ? ' (dry run)' : ''}`);

  const lists = {};
  const results = [];
  for (const m of manifest) {
    const t = TARGETS[m.entity];
    const label = `${m.entity}/${m.slug}`;
    try {
      if (!lists[m.entity]) {
        const r = await call('GET', t.list);
        if (!r.res.ok) throw new Error(`list ${t.list}: HTTP ${r.res.status}`);
        lists[m.entity] = rowsOf(r.json, t.key);
      }
      const row = matchEntity(lists[m.entity], m.slug);
      if (!row) { results.push([label, o.allowMissing ? 'skipped' : 'failed', 'no entity with this slug']); continue; }
      if (t.has(row) && !o.overwrite) { results.push([label, 'skipped', `${t.field} already set`]); continue; }
      if (o.dryRun) { results.push([label, 'ok', `would upload ${m.file} and set ${t.field}`]); continue; }
      const blob = new Blob([fs.readFileSync(path.join(pack, m.file))], { type: 'image/jpeg' });
      const fd = new FormData();
      fd.append('file', blob, m.file);
      const up = await call('POST', '/api/content/upload', fd);
      if (!up.res.ok || !up.json?.url) throw new Error(`upload: HTTP ${up.res.status} ${(up.json?.error || '').toString().slice(0, 120)}`);
      const put = await call('PUT', t.item(rowId(row)), t.set(up.json.url));
      if (!put.res.ok) throw new Error(`update: HTTP ${put.res.status} ${(put.json?.error || put.text || '').toString().slice(0, 200)}${put.json?.fields ? ' ' + JSON.stringify(put.json.fields) : ''}`);
      results.push([label, 'ok', up.json.url]);
    } catch (e) {
      results.push([label, 'failed', e.message]);
    }
  }
  for (const [l, s, d] of results) console.log(`${s.padEnd(8)} ${l.padEnd(32)} ${d}`);
  const n = (s) => results.filter((r) => r[1] === s).length;
  console.log(`\n${n('ok')} ok, ${n('skipped')} skipped, ${n('failed')} failed`);
  process.exit(n('failed') ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
