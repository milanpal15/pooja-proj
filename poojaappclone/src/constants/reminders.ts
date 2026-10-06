import type { IconName } from '@/components/ui';

/**
 * Daily reminders — the "Alarm" tile.
 *
 * These are aarti and mantra reminders, not a general alarm clock: the times
 * that matter here are the temple's own. The defaults follow the traditional
 * daily cycle, so a devotee who turns one on without editing anything still
 * gets it at the right hour.
 *
 * Scheduled as repeating LOCAL notifications. Nothing leaves the device, so
 * they keep working with no backend and no network — which matters at 4am.
 */

/**
 * Any reminder's id. The five below are the bundled daily cycle; a devotee's
 * own reminders get a generated `custom-*` id, so this cannot be a closed
 * union any more.
 */
export type ReminderId = string;

/** The ids of the bundled reminders, for telling them from a devotee's own. */
export type BuiltInReminderId = 'mangala' | 'shringar' | 'sandhya' | 'shayan' | 'mantra';

export type ReminderDef = {
  id: ReminderId;
  title: string;
  titleHi: string;
  body: string;
  bodyHi: string;
  /** Traditional hour, 24h. */
  hour: number;
  minute: number;
  icon: IconName;
};

export const REMINDERS: ReminderDef[] = [
  {
    id: 'mangala',
    title: 'Mangala Aarti',
    titleHi: 'मंगला आरती',
    body: 'The first aarti of the day is being offered.',
    bodyHi: 'दिन की पहली आरती का समय है।',
    hour: 4,
    minute: 30,
    icon: 'diya',
  },
  {
    id: 'shringar',
    title: 'Shringar Aarti',
    titleHi: 'श्रृंगार आरती',
    body: 'The deity is adorned. Take darshan.',
    bodyHi: 'श्रृंगार दर्शन का समय है।',
    hour: 8,
    minute: 0,
    icon: 'marigold',
  },
  {
    id: 'sandhya',
    title: 'Sandhya Aarti',
    titleHi: 'संध्या आरती',
    body: 'Evening aarti. Light a diya.',
    bodyHi: 'संध्या आरती — दीप जलाएँ।',
    hour: 18,
    minute: 30,
    icon: 'diya',
  },
  {
    id: 'shayan',
    title: 'Shayan Aarti',
    titleHi: 'शयन आरती',
    body: 'The last aarti before the sanctum closes.',
    bodyHi: 'शयन आरती — पट बंद होने से पहले।',
    hour: 21,
    minute: 0,
    icon: 'lotus',
  },
  {
    id: 'mantra',
    title: 'Daily Mantra',
    titleHi: 'दैनिक मंत्र',
    body: 'A few minutes of japa.',
    bodyHi: 'कुछ क्षण जप के लिए।',
    hour: 7,
    minute: 0,
    icon: 'sparkle',
  },
];

/* ────────────────────────────────────────────────────────────── tones ── */

/**
 * Alert tones for reminders.
 *
 * This is the "Ringtone" tile, and it is deliberately the app's OWN alert
 * sound rather than the phone's system ringtone. Setting the system ringtone
 * needs Android's RingtoneManager and the WRITE_SETTINGS permission, neither
 * of which exists in Expo Go — it would need a native module and a
 * development build. Choosing what this app plays is real, works today, and
 * is what most devotees actually mean by the setting.
 */
/**
 * A tone's slug. Open, not a union: tones are rows in the dashboard now, so
 * the app cannot know their names at compile time.
 */
export type ToneId = string;

export type ToneDef = {
  id: ToneId;
  title: string;
  titleHi: string;
  desc: string;
  descHi: string;
  icon: IconName;
  /** Maps to the notification sound name; null uses the platform default. */
  sound: string | null;
  /** Preview key into SOUNDS; null means nothing to preview. */
  preview: 'bell' | 'aarti' | null;
};

export const TONES: ToneDef[] = [
  {
    id: 'bell',
    title: 'Temple Bell',
    titleHi: 'मंदिर की घंटी',
    desc: 'A single ghanta strike',
    descHi: 'एक घंटा नाद',
    icon: 'bell',
    sound: 'bell.wav',
    preview: 'bell',
  },
  {
    id: 'aarti',
    title: 'Aarti Ambience',
    titleHi: 'आरती ध्वनि',
    desc: 'Drone and bells',
    descHi: 'ध्वनि एवं घंटियाँ',
    icon: 'music',
    sound: 'aarti.wav',
    preview: 'aarti',
  },
  {
    id: 'default',
    title: 'Phone Default',
    titleHi: 'फ़ोन का डिफ़ॉल्ट',
    desc: 'Whatever your phone uses',
    descHi: 'जो आपके फ़ोन में सेट है',
    icon: 'settings',
    sound: null,
    preview: null,
  },
  {
    id: 'silent',
    title: 'Silent',
    titleHi: 'मौन',
    desc: 'Show it, but stay quiet',
    descHi: 'सूचना दिखे, ध्वनि नहीं',
    icon: 'close',
    sound: null,
    preview: null,
  },
];

/* ─────────────────────────────────────────────────────── wallpapers ── */

/**
 * Wallpapers are composed in the app rather than shipped as images: the
 * sanctum gradient, the mandala and the deity cutout are already in the
 * design system, so a wallpaper is those three plus a mantra, captured at
 * device resolution. No megabytes of bundled art, and every deity gets one
 * for free.
 *
 * The app cannot SET the device wallpaper — that needs Android's
 * WallpaperManager, which is not available in Expo Go. It saves to your
 * gallery instead, which is the step most wallpaper apps take anyway.
 */
export type WallpaperStyle = { id: string; title: string; titleHi: string };

export const WALLPAPER_STYLES: WallpaperStyle[] = [
  { id: 'sanctum', title: 'Sanctum', titleHi: 'गर्भगृह' },
  { id: 'dawn', title: 'Dawn', titleHi: 'उषा' },
  { id: 'night', title: 'Night', titleHi: 'रात्रि' },
];
