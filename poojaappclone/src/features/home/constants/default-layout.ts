import type { RemoteHomeSection } from '@/providers/content';

/**
 * The Home layout used when the API is unreachable (and nothing is cached) or
 * serves none. It is the contract's §1.4 seed — docs/POOJA_AND_HOME.md — so an
 * offline first launch looks like a freshly seeded dashboard. Text-only: no
 * artwork ships in the bundle.
 *
 * Only the SHELF sources (custom, knowledge) are drawn from it now — the fixed
 * approved Home renders the rest itself (see lib/sections.ts `shelfSections`).
 * The other entries stay so the bundled layout keeps matching the seed.
 */
const PITRU_START = '2026-09-25T18:30:00.000Z';
const PITRU_END = '2026-10-10T18:29:59.000Z';

export const DEFAULT_SECTIONS: RemoteHomeSection[] = [
  { key: 'hero', source: 'hero', order: 10 },
  { key: 'astrologer', source: 'astrologer', order: 20 },
  {
    key: 'quick-grid',
    source: 'grid',
    order: 30,
    items: [
      { title: 'Live Darshan', titleHi: 'लाइव दर्शन', icon: 'temple', href: '/darshan', flag: 'liveDarshan', badge: 'new' },
      { title: 'Horoscope', titleHi: 'राशिफल', icon: 'sparkle', href: '/horoscope', badge: 'new' },
      { title: 'Panchang', titleHi: 'पंचांग', icon: 'calendar', href: '/panchang', badge: 'new' },
      { title: 'Bhajan', titleHi: 'भजन', icon: 'music', href: '/bhajan', flag: 'bhajan' },
      { title: 'Wallpaper', titleHi: 'वॉलपेपर', icon: 'star', href: '/wallpaper' },
      { title: 'Alarm', titleHi: 'अलार्म', icon: 'bell', href: '/alarm', badge: 'new' },
      { title: 'Ringtone', titleHi: 'रिंगटोन', icon: 'music', href: '/ringtone' },
      // Unbuilt: says so, never navigates.
      { title: 'Status', titleHi: 'स्टेटस', icon: 'share', badge: 'soon' },
    ],
  },
  {
    key: 'festivals',
    source: 'festivals',
    order: 40,
    title: 'Upcoming Vrat & Festivals',
    titleHi: 'आने वाले व्रत एवं त्योहार',
    tone: 'crimson',
    footerLabel: 'See all dates',
    footerLabelHi: 'सारी तिथि देखें',
    footerHref: '/festivals',
  },
  // Seasonal and scheduled, like the seed: it switches itself off after Pitru Paksha.
  {
    key: 'pitru-paksha',
    source: 'custom',
    order: 50,
    title: 'Pitru Paksha Special',
    titleHi: 'पितृ पक्ष विशेष',
    tone: 'purple',
    layout: 'photo3',
    startsAt: PITRU_START,
    endsAt: PITRU_END,
    footerLabel: 'See all dates',
    footerLabelHi: 'सारी तिथि देखें',
    footerHref: '/festivals',
    items: [
      { title: 'Pitru Paksha', titleHi: 'पितृ पक्ष', href: '/festivals' },
      { title: '27 Sep to 10 Oct', titleHi: '27 सितंबर से 10 अक्टूबर', href: '/festivals' },
      { title: 'Blessings of ancestors', titleHi: 'पितरों की कृपा', href: '/poojas' },
    ],
  },
  {
    key: 'daily',
    source: 'daily',
    order: 60,
    title: "Today's Special",
    titleHi: 'आज का विशेष',
    tone: 'forest',
    items: [
      { title: 'What to do today', titleHi: 'आज क्या करें', subtitle: 'Auspicious acts for the day', subtitleHi: 'दिन में यह शुभ काम करें', icon: 'sparkle', badge: 'soon' },
      { title: "Today's mantra", titleHi: 'आज का शुभ मंत्र', subtitle: 'Listen to the day’s mantra', subtitleHi: 'आज का शुभ मंत्र सुनें', icon: 'music', href: '/bhajan' },
      { title: "Today's horoscope", titleHi: 'आज का राशिफल', subtitle: 'Your sign, read for today', subtitleHi: 'अपनी राशि का फल देखें', icon: 'star', href: '/horoscope' },
      { title: "Today's muhurat", titleHi: 'आज के मुहूर्त देखें', subtitle: 'Auspicious timings and Rahukaal', subtitleHi: 'शुभ मुहूर्त व राहुकाल देखें', icon: 'calendar', href: '/panchang' },
    ],
  },
  { key: 'temples', source: 'temples', order: 70, title: 'Popular Temples', titleHi: 'लोकप्रिय मंदिर' },
  {
    key: 'features',
    source: 'features',
    order: 80,
    items: [
      { title: 'Virtual Pooja', titleHi: 'वर्चुअल पूजा', icon: 'diya', href: '/pooja', flag: 'virtualPooja' },
      { title: 'Bhajans', titleHi: 'भजन', icon: 'music', href: '/bhajan', flag: 'bhajan' },
      { title: 'E-Chadhava', titleHi: 'ई-चढ़ावा', icon: 'marigold', href: '/chadhava', flag: 'chadhava' },
      { title: 'Daily Journal', titleHi: 'दैनिक जर्नल', icon: 'lotus', href: '/journal', flag: 'journal' },
    ],
  },
  {
    key: 'books',
    source: 'custom',
    order: 90,
    title: 'Pooja & Paath Books',
    titleHi: 'पूजा-पाठ की किताबें',
    tone: 'gold',
    layout: 'book2',
    items: [
      { title: 'Aarti', titleHi: 'आरती', icon: 'diya', href: '/bhajan' },
      { title: 'Chalisa', titleHi: 'चालीसा', icon: 'lotus', href: '/bhajan' },
      { title: 'Katha', titleHi: 'कथा', icon: 'sparkle', href: '/bhajan' },
      { title: 'Paath', titleHi: 'पाठ', icon: 'temple', href: '/bhajan' },
    ],
  },
  {
    key: 'knowledge',
    source: 'knowledge',
    order: 100,
    title: 'Knowledge of the Gods',
    titleHi: 'देवों का ज्ञान',
    tone: 'purple',
    footerLabel: 'See all deities',
    footerLabelHi: 'सभी देव देखें',
    footerHref: '/knowledge',
    items: [{ deitySlug: 'vishnu' }, { deitySlug: 'shiva' }, { deitySlug: 'ganesh' }],
  },
  {
    key: 'ancestors',
    source: 'custom',
    order: 110,
    title: 'Blessings of Your Ancestors',
    titleHi: 'अपने पितरों का आशीर्वाद पाएँ',
    tone: 'maroon',
    layout: 'photo3',
    startsAt: PITRU_START,
    endsAt: PITRU_END,
    items: [
      { title: 'Book a seva', titleHi: 'सेवा कराएँ', href: '/poojas' },
      { title: 'Offer chadhava', titleHi: 'चढ़ावा चढ़ाएँ', href: '/chadhava' },
      { title: 'Perform pooja', titleHi: 'पूजा करें', href: '/poojas' },
    ],
  },
  { key: 'darshan', source: 'darshan', order: 120 },
];
