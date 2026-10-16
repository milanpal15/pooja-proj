/**
 * Make two spellings of the same word comparable: lower-case, no Latin accents, no
 * punctuation, one space between words.
 *
 * Only the Latin combining-marks block (U+0300-036F) is stripped. Devanagari vowel
 * signs are marks too, and removing them would turn "शिव" into "शव"; the text is
 * re-composed (NFC) afterwards so a nukta typed as one or two code points compares equal.
 */
export function normalize(input: unknown): string {
  if (typeof input !== 'string' || !input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ​-‍﻿]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .replace(/ {2,}/g, ' ');
}

/** The words of a query, normalised and de-duplicated. Empty for a blank query. */
export function tokenize(query: unknown): string[] {
  const n = normalize(query);
  if (!n) return [];
  return Array.from(new Set(n.split(' ')));
}
