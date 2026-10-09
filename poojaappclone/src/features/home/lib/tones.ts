/** Deep warm grounds that carry white text; each is [from, to] for a diagonal gradient. */
const LIGHT: readonly (readonly [string, string])[] = [
  ['#8A2A12', '#E2893B'],
  ['#4A2A66', '#9A5AA0'],
  ['#7A1C2A', '#C2410C'],
  ['#1F3550', '#4B6A8A'],
  ['#9A3412', '#E8891B'],
  ['#14532D', '#3F8F5A'],
];
/** The same hues pulled darker so a card does not glare on the dark scheme. */
const DARK: readonly (readonly [string, string])[] = [
  ['#5A1C0C', '#8F5522'],
  ['#2E1A42', '#5E3A66'],
  ['#4D1219', '#7C2A0A'],
  ['#142235', '#2F4358'],
  ['#612208', '#92550F'],
  ['#0B3419', '#27593A'],
];

/**
 * A stable gradient for an item with no artwork (a slide, a pooja, a listing),
 * chosen from its slug so the same card keeps the same colour between launches.
 */
export function toneFor(seed: string, dark: boolean): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const set = dark ? DARK : LIGHT;
  return set[h % set.length];
}
