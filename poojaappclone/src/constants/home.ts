import type { IconName } from '@/components/ui';

/**
 * Home-screen content shelves, modelled on the reference app.
 *
 * All of this is local seed data. It is shaped the way the admin API will
 * eventually serve it — id, title, route, availability — so moving each shelf
 * onto `/api/content` later is a swap of the source, not a rewrite of the
 * screen.
 *
 * `soon: true` is honest rather than decorative: the reference app ships
 * "जल्द आ रहा है" chips on features it has not built either. A tile that
 * announces itself as unbuilt is better than one that opens an empty screen.
 */

export type QuickTile = {
  id: string;
  labelKey: string;
  /** Fallback label when no translation exists yet. */
  label: string;
  icon: IconName;
  href?: string;
  /** Gate on an admin feature flag, when one applies. */
  flag?: string;
  badge?: 'new' | 'soon';
};

/** The 8-up grid under the hero. */
export const QUICK_TILES: QuickTile[] = [
  { id: 'darshan', label: 'Darshan', labelKey: 'live_darshan', icon: 'temple', href: '/darshan', flag: 'liveDarshan', badge: 'new' },
  { id: 'rashifal', label: 'Horoscope', labelKey: 'rashifal', icon: 'sparkle', badge: 'soon' },
  { id: 'panchang', label: 'Panchang', labelKey: 'panchang', icon: 'calendar', badge: 'new' },
  { id: 'bhajan', label: 'Bhajan', labelKey: 'tab_bhajan', icon: 'music', href: '/bhajan', flag: 'bhajan' },
  { id: 'wallpaper', label: 'Wallpaper', labelKey: 'wallpaper', icon: 'star', href: '/wallpaper' },
  { id: 'alarm', label: 'Alarm', labelKey: 'alarm', icon: 'bell', href: '/alarm', badge: 'new' },
  { id: 'ringtone', label: 'Ringtone', labelKey: 'ringtone', icon: 'music', href: '/ringtone' },
  { id: 'status', label: 'Status', labelKey: 'status', icon: 'share', badge: 'soon' },
];

/* ─────────────────────────────────────────────────── vrat & festivals ── */

export type Festival = {
  id: string;
  name: string;
  nameHi: string;
  /** ISO date. Compared against today to build the upcoming list. */
  date: string;
  deity: string;
};

/**
 * Seeded around the Shravan calendar, which is when the reference screenshots
 * were taken. Dates are 2026 so "upcoming" resolves sensibly today.
 */
export const FESTIVALS: Festival[] = [
  { id: 'sawan-somwar-3', name: 'Third Sawan Somwar', nameHi: 'तृतीय सावन सोमवार', date: '2026-08-17', deity: 'shiva' },
  { id: 'nag-panchami', name: 'Nag Panchami', nameHi: 'नाग पंचमी', date: '2026-08-17', deity: 'shiva' },
  { id: 'pradosh', name: 'Pradosh Vrat', nameHi: 'प्रदोष व्रत', date: '2026-08-25', deity: 'shiva' },
  { id: 'sawan-somwar-4', name: 'Fourth Sawan Somwar', nameHi: 'सावन सोमवार', date: '2026-08-24', deity: 'shiva' },
  { id: 'jaya-parvati', name: 'Jaya Parvati Vrat', nameHi: 'जयापार्वती व्रत', date: '2026-09-01', deity: 'durga' },
  { id: 'janmashtami', name: 'Krishna Janmashtami', nameHi: 'कृष्ण जन्माष्टमी', date: '2026-09-04', deity: 'krishna' },
];

/** Festivals on or after today, soonest first. */
export function upcomingFestivals(now = new Date(), limit = 4): Festival[] {
  const today = now.toISOString().slice(0, 10);
  return FESTIVALS.filter((f) => f.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/* ────────────────────────────────────────────────────── daily guidance ── */

export type DailyItem = {
  id: string;
  title: string;
  titleHi: string;
  subtitle: string;
  subtitleHi: string;
  icon: IconName;
  href?: string;
};

/** "आज का विशेष" — the numbered daily list. */
export const DAILY: DailyItem[] = [
  {
    id: 'what-to-do',
    title: 'What to do today',
    titleHi: 'आज क्या करें',
    subtitle: 'Auspicious acts for the day',
    subtitleHi: 'दिन में यह शुभ काम करें',
    icon: 'sparkle',
  },
  {
    id: 'mantra',
    title: "Today's mantra",
    titleHi: 'आज का शुभ मंत्र',
    subtitle: 'Listen to the day’s mantra',
    subtitleHi: 'आज का शुभ मंत्र सुनें',
    icon: 'music',
    href: '/bhajan',
  },
  {
    id: 'rashifal',
    title: "Today's horoscope",
    titleHi: 'आज का राशिफल',
    subtitle: 'Your sign, read for today',
    subtitleHi: 'अपनी राशि का फल देखें',
    icon: 'star',
  },
  {
    id: 'muhurat',
    title: "Today's muhurat",
    titleHi: 'आज के मुहूर्त देखें',
    subtitle: 'Auspicious timings and Rahukaal',
    subtitleHi: 'शुभ मुहूर्त व राहुकाल देखें',
    icon: 'calendar',
  },
];

/* ─────────────────────────────────────────────────────────── scripture ── */

export type Shelf = { id: string; title: string; titleHi: string; icon: IconName; href?: string };

/** "पूजा-पाठ की किताबें" */
export const SCRIPTURE: Shelf[] = [
  { id: 'aarti', title: 'Aarti', titleHi: 'आरती', icon: 'diya', href: '/bhajan' },
  { id: 'chalisa', title: 'Chalisa', titleHi: 'चालीसा', icon: 'lotus' },
  { id: 'katha', title: 'Katha', titleHi: 'कथा', icon: 'sparkle' },
  { id: 'paath', title: 'Paath', titleHi: 'पाठ', icon: 'temple' },
];

/** "देवों का ज्ञान" — deity knowledge cards. */
export const DEITY_KNOWLEDGE = ['vishnu', 'shiva', 'ganesh'] as const;
