/**
 * A small QR Code encoder in pure TypeScript (no native module, so no prebuild).
 *
 * Scope, deliberately narrow: BYTE mode, versions 1-4, single Reed-Solomon block. That is ECC level M
 * up to version 3 (42 bytes) and ECC level L up to version 4 (78 bytes) — plenty for an event pass
 * code like `GRB-4K7Q`. Anything longer returns `null` and the caller shows the code as text instead.
 * Multi-block versions (5+) are intentionally not implemented.
 *
 * Returns the module matrix (`true` = dark). Pure and deterministic.
 */

export type QrMatrix = boolean[][];

type Ecl = 'L' | 'M';

/** Per version: total data codewords and EC codewords, for the single-block levels we support. */
const SPEC: Record<Ecl, Record<number, { data: number; ec: number }>> = {
  M: { 1: { data: 16, ec: 10 }, 2: { data: 28, ec: 16 }, 3: { data: 44, ec: 26 } },
  L: { 1: { data: 19, ec: 7 }, 2: { data: 34, ec: 10 }, 3: { data: 55, ec: 15 }, 4: { data: 80, ec: 20 } },
};
const FORMAT_BITS: Record<Ecl, number> = { L: 1, M: 0 };

/* ───────────────────────────────────────────────────────── Reed-Solomon ── */

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial of degree `n` (highest coefficient first, leading 1 omitted). */
function generator(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly.slice(1);
}

/** The `ecCount` error-correction codewords for `data`. */
export function rsEncode(data: readonly number[], ecCount: number): number[] {
  const gen = generator(ecCount);
  const rem = new Array<number>(ecCount).fill(0);
  for (const b of data) {
    const factor = b ^ (rem.shift() as number);
    rem.push(0);
    for (let i = 0; i < ecCount; i++) rem[i] ^= gfMul(gen[i], factor);
  }
  return rem;
}

/* ─────────────────────────────────────────────────────────── data bits ── */

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/** Data codewords (padded) for `bytes` at the given capacity. */
export function dataCodewords(bytes: readonly number[], capacity: number): number[] {
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8); // count: 8 bits for versions 1-9
  for (const b of bytes) push(b, 8);
  const cap = capacity * 8;
  push(0, Math.min(4, cap - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/* ──────────────────────────────────────────────────────────── matrix ── */

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
];

/** The 15 format bits (BCH-protected) for an ECC level and mask, as drawn on the symbol. */
export function formatBits(ecl: Ecl, mask: number): number {
  const data = (FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

function penalty(m: QrMatrix): number {
  const n = m.length;
  let score = 0;
  // Rule 1: runs of 5+ in a row/column.
  for (let a = 0; a < n; a++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const cur = horizontal ? m[a][b] : m[b][a];
        const prev = horizontal ? m[a][b - 1] : m[b - 1][a];
        if (cur === prev) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }
  // Rule 2: 2x2 blocks.
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  // Rule 3: finder-like 1:1:3:1:1 with 4 light on a side.
  const pat = [true, false, true, true, true, false, true];
  const at = (y: number, x: number, h: boolean) => (h ? m[y][x] : m[x][y]);
  for (let a = 0; a < n; a++)
    for (const h of [true, false])
      for (let b = 0; b + 7 <= n; b++) {
        if (!pat.every((v, i) => at(a, b + i, h) === v)) continue;
        const light = (from: number, to: number) => {
          for (let i = from; i < to; i++) if (i >= 0 && i < n && at(a, i, h)) return false;
          return true;
        };
        if (light(b - 4, b) || light(b + 7, b + 11)) score += 40;
      }
  // Rule 4: dark/light balance.
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/** Encodes `text` as a QR module matrix, or `null` when it does not fit versions 1-4. */
export function qrMatrix(text: string): QrMatrix | null {
  const bytes = utf8(text);
  if (bytes.length === 0) return null;
  let pick: { ecl: Ecl; version: number } | null = null;
  for (const ecl of ['M', 'L'] as const) {
    for (const v of Object.keys(SPEC[ecl]).map(Number)) {
      if (!pick && bytes.length + 2 <= SPEC[ecl][v].data) pick = { ecl, version: v };
    }
    if (pick) break;
  }
  if (!pick) return null;
  const { ecl, version } = pick;
  const { data: cap, ec } = SPEC[ecl][version];
  const data = dataCodewords(bytes, cap);
  const codewords = [...data, ...rsEncode(data, ec)];

  const size = 17 + 4 * version;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    mod[y][x] = dark;
    fn[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
  }
  if (version >= 2) {
    const c = size - 7;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // Reserve the format areas (drawn per mask below) and the dark module.
  const drawFormat = (bits: number) => {
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);

  // Data, zig-zag from the bottom-right, two columns at a time.
  let bitIndex = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && bitIndex < total) {
          mod[y][x] = ((codewords[bitIndex >> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
      }
    }
  }

  let best: QrMatrix | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const trial = mod.map((row) => row.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) trial[y][x] = !trial[y][x];
    const keep = mod.map((r) => r.slice());
    // Draw the format info onto the trial (swap in, draw, swap back).
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mod[y][x] = trial[y][x];
    drawFormat(formatBits(ecl, mask));
    const drawn = mod.map((r) => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mod[y][x] = keep[y][x];
    const s = penalty(drawn);
    if (s < bestScore) {
      bestScore = s;
      best = drawn;
    }
  }
  return best;
}

/** One SVG path for every dark module (unit squares), so a QR is a single element. */
export function qrPath(m: QrMatrix, quiet = 0): string {
  const parts: string[] = [];
  for (let y = 0; y < m.length; y++) {
    let x = 0;
    while (x < m.length) {
      if (!m[y][x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < m.length && m[y][end]) end++;
      parts.push(`M${x + quiet} ${y + quiet}h${end - x}v1h${x - end}z`);
      x = end;
    }
  }
  return parts.join('');
}
