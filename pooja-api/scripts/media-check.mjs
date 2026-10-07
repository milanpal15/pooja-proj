/**
 * Prove uploaded media survives a round trip through MongoDB.
 *
 *   BASE=http://127.0.0.1:4000 ADMIN_PASSWORD=… node scripts/media-check.mjs
 *
 * The gate smoke test checks who may call what. This checks the thing that
 * actually carries the temple's artwork and recordings, which the smoke
 * test never touches: upload, read back byte-for-byte, serve a byte range,
 * and delete. Every one of those has broken at least once — the content
 * type silently became octet-stream, and a route that threw took the whole
 * API down with it.
 */
const BASE = (process.env.BASE || 'http://127.0.0.1:4000').replace(/\/$/, '');
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const USERNAME = process.env.ADMIN_USERNAME || 'admin';

let failures = 0;
const pass = (what) => console.log(`  PASS  ${what}`);
const fail = (what, detail) => {
  failures++;
  console.log(`  FAIL  ${what}${detail ? `  — ${detail}` : ''}`);
};

/* A tiny but real PNG, built here so the check carries no fixture file. */
const { deflateSync } = await import('node:zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePng(w = 64, h = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 4);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 4;
      raw[p] = (x * 4) & 0xff; raw[p + 1] = (y * 4) & 0xff; raw[p + 2] = 0x80; raw[p + 3] = 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

console.log(`\nMedia round trip → ${BASE}\n`);

/* ---- sign in, because uploading is not public ---- */
let cookie = '';
if (PASSWORD) {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (res.status !== 200) {
    fail('sign in', `got ${res.status}`);
  } else {
    cookie = (res.headers.get('set-cookie') || '').split(';')[0];
    pass('sign in');
  }
}

const body = makePng();
const form = new FormData();
form.append('file', new Blob([body], { type: 'image/png' }), 'media-check.png');

const up = await fetch(`${BASE}/api/content/upload`, {
  method: 'POST',
  body: form,
  headers: cookie ? { cookie } : {},
});

if (up.status !== 200) {
  fail('upload accepted', `got ${up.status}`);
} else {
  pass('upload accepted');
  const { url } = await up.json();

  if (!/^\/uploads\/[0-9a-f]{24}\.png$/.test(url || '')) {
    fail('upload returns a host-relative /uploads/<id>.ext url', url);
  } else {
    pass('upload returns a host-relative /uploads/<id>.ext url');
  }

  /* ---- read it back ---- */
  const get = await fetch(`${BASE}${url}`);
  const back = Buffer.from(await get.arrayBuffer());
  get.status === 200 ? pass('served without a session') : fail('served without a session', `got ${get.status}`);
  back.equals(body)
    ? pass('bytes survive the round trip')
    : fail('bytes survive the round trip', `${body.length} out, ${back.length} back`);
  get.headers.get('content-type') === 'image/png'
    ? pass('content type preserved')
    : fail('content type preserved', get.headers.get('content-type'));
  get.headers.get('accept-ranges') === 'bytes'
    ? pass('advertises range support')
    : fail('advertises range support', get.headers.get('accept-ranges'));

  /* ---- a byte range, which is what MediaPlayer and audio seeking use ---- */
  const ranged = await fetch(`${BASE}${url}`, { headers: { Range: 'bytes=0-99' } });
  const part = Buffer.from(await ranged.arrayBuffer());
  ranged.status === 206 && part.length === 100 && part.equals(body.subarray(0, 100))
    ? pass('range request returns exactly those bytes')
    : fail('range request returns exactly those bytes', `${ranged.status}, ${part.length} bytes`);

  const bad = await fetch(`${BASE}${url}`, { headers: { Range: 'bytes=99999999-' } });
  bad.status === 416 ? pass('unsatisfiable range refused') : fail('unsatisfiable range refused', `got ${bad.status}`);

  /* ---- and clean up after itself ---- */
  if (cookie) {
    const del = await fetch(`${BASE}/api/content/upload`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ url }),
    });
    del.status === 200 ? pass('deleted') : fail('deleted', `got ${del.status}`);
    const gone = await fetch(`${BASE}${url}`);
    gone.status === 404 ? pass('gone after delete') : fail('gone after delete', `got ${gone.status}`);
  }
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll good.\n');
process.exit(failures ? 1 : 0);
