import { HomeSection } from './home.model.js';

const t = (title, titleHi, icon, href, extra = {}) => ({ title, titleHi, icon, href, ...extra });

/**
 * Today's Home (features/home in the app), as data: same bands, same order.
 * The app renders `hero`, `astrologer`, `festivals`, `temples` and `darshan`
 * from content it already loads; the rest carry their own items.
 */
const DEFAULT_LAYOUT = [
  { key: 'hero', source: 'hero', title: 'Highlights', titleHi: 'मुख्य आकर्षण', tone: 'maroon', layout: 'photo3' },
  { key: 'astrologer', source: 'astrologer', title: 'Talk to an Astrologer', titleHi: 'ज्योतिषी से बात करें', tone: 'purple', layout: 'list' },
  {
    key: 'quick-grid', source: 'grid', title: 'Explore', titleHi: 'अन्वेषण', tone: 'gold', layout: 'grid4',
    items: [
      t('Darshan', 'दर्शन', 'temple', '/darshan', { flag: 'liveDarshan', badge: 'new' }),
      t('Horoscope', 'राशिफल', 'sparkle', '/horoscope', { badge: 'new' }),
      t('Panchang', 'पंचांग', 'calendar', '/panchang', { badge: 'new' }),
      t('Bhajan', 'भजन', 'music', '/bhajan', { flag: 'bhajan' }),
      t('Wallpaper', 'वॉलपेपर', 'star', '/wallpaper'),
      t('Alarm', 'अलार्म', 'bell', '/alarm', { badge: 'new' }),
      t('Ringtone', 'रिंगटोन', 'music', '/ringtone'),
      t('Status', 'स्टेटस', 'share', '', { badge: 'soon' }),
    ],
  },
  { key: 'festivals', source: 'festivals', title: 'Upcoming Vrat & Festivals', titleHi: 'आगामी व्रत और त्योहार', tone: 'crimson', layout: 'list', footerLabel: 'See all dates', footerLabelHi: 'सभी तिथियाँ देखें', footerHref: '/festivals' },
  // A seasonal block, scheduled: it switches itself on and off, and is edited (or deleted) in the dashboard.
  {
    key: 'pitru-paksha', source: 'custom', title: 'Pitru Paksha Special', titleHi: 'पितृ पक्ष विशेष', tone: 'purple', layout: 'photo3',
    startsAt: new Date('2026-09-25T18:30:00Z'), endsAt: new Date('2026-10-10T18:29:59Z'),
    footerLabel: 'See all dates', footerLabelHi: 'सारी तिथि देखें', footerHref: '/festivals',
    items: [
      t('Pitru Paksha', 'पितृ पक्ष', '', '/festivals'),
      t('27 Sep to 10 Oct', '27 सितंबर से 10 अक्टूबर', '', '/festivals'),
      t('Blessings of ancestors', 'पितरों की कृपा', '', '/poojas'),
    ],
  },
  {
    key: 'daily', source: 'daily', title: "Today's Special", titleHi: 'आज का विशेष', tone: 'forest', layout: 'list',
    items: [
      t('What to do today', 'आज क्या करें', 'sparkle', '', { subtitle: 'Auspicious acts for the day', subtitleHi: 'दिन में यह शुभ काम करें' }),
      t("Today's mantra", 'आज का शुभ मंत्र', 'music', '/bhajan', { subtitle: 'Listen to the day’s mantra', subtitleHi: 'आज का शुभ मंत्र सुनें' }),
      t("Today's horoscope", 'आज का राशिफल', 'star', '', { subtitle: 'Your sign, read for today', subtitleHi: 'अपनी राशि का फल देखें' }),
      t("Today's muhurat", 'आज के मुहूर्त देखें', 'calendar', '', { subtitle: 'Auspicious timings and Rahukaal', subtitleHi: 'शुभ मुहूर्त व राहुकाल देखें' }),
    ],
  },
  { key: 'temples', source: 'temples', title: 'Popular Temples', titleHi: 'लोकप्रिय मंदिर', tone: 'gold', layout: 'photo3', footerLabel: 'See all temples', footerLabelHi: 'सभी मंदिर देखें', footerHref: '/temples' },
  {
    key: 'features', source: 'features', title: 'More to explore', titleHi: 'और देखें', tone: 'maroon', layout: 'grid4',
    items: [
      t('Virtual Pooja', 'वर्चुअल पूजा', 'diya', '/pooja', { flag: 'virtualPooja' }),
      t('Bhajans', 'भजन', 'music', '/bhajan', { flag: 'bhajan' }),
      t('e-Chadhava', 'ई-चढ़ावा', 'marigold', '/chadhava', { flag: 'chadhava' }),
      t('Journal', 'जर्नल', 'lotus', '/journal', { flag: 'journal' }),
    ],
  },
  {
    key: 'books', source: 'custom', title: 'Pooja & Paath Books', titleHi: 'पूजा-पाठ की किताबें', tone: 'gold', layout: 'book2',
    items: [
      t('Aarti', 'आरती', 'diya', '/bhajan'),
      t('Chalisa', 'चालीसा', 'lotus', '/bhajan'),
      t('Katha', 'कथा', 'sparkle', '/bhajan'),
      t('Paath', 'पाठ', 'temple', '/bhajan'),
    ],
  },
  {
    key: 'knowledge', source: 'knowledge', title: 'Knowledge of the Gods', titleHi: 'देवों का ज्ञान', tone: 'purple', layout: 'photo3',
    items: ['vishnu', 'shiva', 'ganesh'].map((d) => ({ deitySlug: d, href: '/knowledge' })),
  },
  {
    key: 'ancestors', source: 'custom', title: 'Blessings of Your Ancestors', titleHi: 'अपने पितरों का आशीर्वाद पाएँ', tone: 'maroon', layout: 'photo3',
    startsAt: new Date('2026-09-25T18:30:00Z'), endsAt: new Date('2026-10-10T18:29:59Z'),
    items: [
      t('Book a seva', 'सेवा कराएँ', '', '/poojas'),
      t('Offer chadhava', 'चढ़ावा चढ़ाएँ', '', '/chadhava'),
      t('Perform pooja', 'पूजा करें', '', '/poojas'),
    ],
  },
  { key: 'darshan', source: 'darshan', title: 'Live Darshan', titleHi: 'लाइव दर्शन', tone: 'crimson', layout: 'photo3' },
];

/** Seed the default layout into an EMPTY collection only — a section an operator deleted stays deleted. */
export async function seedHome() {
  if ((await HomeSection.countDocuments()) > 0) return;
  await HomeSection.insertMany(DEFAULT_LAYOUT.map((s, i) => ({ ...s, order: (i + 1) * 10 })));
}
