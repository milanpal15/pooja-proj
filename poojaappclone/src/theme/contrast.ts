/**
 * WCAG contrast maths.
 *
 * Here because the export shipped gold headings on cream that measure 2.3:1,
 * and nobody caught it — a palette review that relies on looking at swatches
 * will keep missing that. The gallery renders these numbers next to the live
 * swatches so a regression is visible rather than arguable.
 */

/** Parse `#RGB`, `#RRGGBB`, or `rgba(r,g,b,a)` into 0–255 channels. */
function channels(color: string): [number, number, number, number] | null {
  const rgba = color.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => parseFloat(p.trim()));
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }

  let hex = color.replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    1,
  ];
}

/** Relative luminance, per WCAG 2.1. */
export function luminance(color: string): number | null {
  const ch = channels(color);
  if (!ch) return null;
  const [r, g, b] = ch.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Composite `over` onto `under`, honouring `over`'s alpha. */
function flatten(over: string, under: string): string | null {
  const o = channels(over);
  const u = channels(under);
  if (!o || !u) return null;
  if (o[3] >= 1) return `rgb(${o[0]},${o[1]},${o[2]})`;
  const mix = [0, 1, 2].map((i) => Math.round(o[i] * o[3] + u[i] * (1 - o[3])));
  return `rgb(${mix.join(',')})`;
}

/**
 * Contrast ratio between two colours, 1–21.
 *
 * Both arguments may be translucent, which matters here because half the
 * sanctum's container tokens are `rgba(255,255,255,0.1)`-style washes. The
 * background is flattened onto `base` first (the opaque surface underneath
 * it), then the foreground is flattened onto that result — so a glass card
 * reports the ratio a reader actually perceives rather than the one its raw
 * hex implies. Measuring the raw values instead reports a near-white wash as
 * near-white, which is how a legible pair can look like a 1.14:1 failure.
 */
export function contrast(
  foreground: string,
  background: string,
  base?: string,
): number | null {
  const solidBg = flatten(background, base ?? background);
  if (!solidBg) return null;

  const solidFg = flatten(foreground, solidBg);
  if (!solidFg) return null;

  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  if (l1 === null || l2 === null) return null;

  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA Large' | 'Fail';

/** Grade a ratio for body text (`large` = 18.66px bold or 24px regular). */
export function grade(ratio: number | null, large = false): ContrastGrade {
  if (ratio === null) return 'Fail';
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3 && large) return 'AA Large';
  return 'Fail';
}
