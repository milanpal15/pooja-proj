import type { AudioSource } from 'expo-audio';

/**
 * Sound sources for the mandir.
 *
 * These are royalty-free, procedurally-synthesised placeholders (a temple-bell
 * strike and an aarti ambience = drone + bells). Swap them for real recordings
 * anytime — drop files in assets/audio/ or use a remote `{ uri }`.
 *
 * - `bell`  — a single temple-bell strike (played on tap, looped during Auto Aarti).
 * - `aarti` — an aarti ambience loop (music button / Auto Aarti).
 */
export const SOUNDS: { bell: AudioSource | null; aarti: AudioSource | null } = {
  bell: require('@/assets/audio/bell.wav'),
  aarti: require('@/assets/audio/aarti.wav'),
};
