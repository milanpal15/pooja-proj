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
  // `soon`, not `new`: there is no Panchang route. Badged NEW it rendered
  // bright and tappable and then answered "Coming soon", promising a
  // feature that does not exist. Every other unbuilt tile is `soon`,
  // which greys it and disables the press.
  { id: 'panchang', label: 'Panchang', labelKey: 'panchang', icon: 'calendar', badge: 'soon' },
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
 * Bundled fallback festival calendar.
 *
 * ⚠️ **These dates expire.** Hindu festivals follow the lunar calendar, so
 * they move every year and cannot be computed from a Gregorian rule. This
 * list previously ran only to 2026-09-04, which meant `upcomingFestivals()`
 * silently returned nothing and the Home section rendered blank — a hardcoded
 * calendar rots exactly this quietly.
 *
 * Two mitigations, because one is not enough:
 *  1. `ContentProvider` prefers festivals served by the admin backend, so the
 *     dates can be corrected without shipping a build. This array is only the
 *     offline fallback.
 *  2. The Home section now renders an explicit empty state instead of a void.
 *
 * Verify against a panchang before each release — the entries below are
 * approximate and are there so the screen has something truthful-looking to
 * show offline, not as an authority on tithi.
 */
export const FESTIVALS: Festival[] = [
  { id: 'sharad-navratri', name: 'Sharad Navratri begins', nameHi: 'शारदीय नवरात्रि प्रारंभ', date: '2026-10-11', deity: 'durga' },
  { id: 'durga-ashtami', name: 'Durga Ashtami', nameHi: 'दुर्गा अष्टमी', date: '2026-10-18', deity: 'durga' },
  { id: 'dussehra', name: 'Vijayadashami', nameHi: 'विजयादशमी', date: '2026-10-20', deity: 'durga' },
  { id: 'karva-chauth', name: 'Karva Chauth', nameHi: 'करवा चौथ', date: '2026-10-29', deity: 'shiva' },
  { id: 'dhanteras', name: 'Dhanteras', nameHi: 'धनतेरस', date: '2026-11-06', deity: 'lakshmi' },
  { id: 'diwali', name: 'Diwali · Lakshmi Puja', nameHi: 'दिवाली · लक्ष्मी पूजा', date: '2026-11-08', deity: 'lakshmi' },
  { id: 'govardhan', name: 'Govardhan Puja', nameHi: 'गोवर्धन पूजा', date: '2026-11-09', deity: 'krishna' },
  { id: 'bhai-dooj', name: 'Bhai Dooj', nameHi: 'भाई दूज', date: '2026-11-10', deity: 'krishna' },
  { id: 'chhath', name: 'Chhath Puja', nameHi: 'छठ पूजा', date: '2026-11-15', deity: 'vishnu' },
  { id: 'gita-jayanti', name: 'Gita Jayanti', nameHi: 'गीता जयंती', date: '2026-12-20', deity: 'krishna' },
  { id: 'makar-sankranti', name: 'Makar Sankranti', nameHi: 'मकर संक्रांति', date: '2027-01-14', deity: 'vishnu' },
  { id: 'vasant-panchami', name: 'Vasant Panchami', nameHi: 'वसंत पंचमी', date: '2027-01-22', deity: 'lakshmi' },
  { id: 'maha-shivaratri', name: 'Maha Shivaratri', nameHi: 'महाशिवरात्रि', date: '2027-03-06', deity: 'shiva' },
  { id: 'holi', name: 'Holi', nameHi: 'होली', date: '2027-03-22', deity: 'krishna' },
  { id: 'ram-navami', name: 'Ram Navami', nameHi: 'राम नवमी', date: '2027-04-15', deity: 'vishnu' },
  { id: 'hanuman-jayanti', name: 'Hanuman Jayanti', nameHi: 'हनुमान जयंती', date: '2027-04-20', deity: 'hanuman' },
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
  { id: 'chalisa', title: 'Chalisa', titleHi: 'चालीसा', icon: 'lotus', href: '/bhajan' },
  { id: 'katha', title: 'Katha', titleHi: 'कथा', icon: 'sparkle', href: '/bhajan' },
  { id: 'paath', title: 'Paath', titleHi: 'पाठ', icon: 'temple', href: '/bhajan' },
];

/** "देवों का ज्ञान" — deity knowledge cards. */
export const DEITY_KNOWLEDGE = ['vishnu', 'shiva', 'ganesh'] as const;
