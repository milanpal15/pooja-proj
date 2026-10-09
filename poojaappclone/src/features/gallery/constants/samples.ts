import type { IconName } from '@/components/ui';
import type { ColorRoles, TypeVariant } from '@/theme';

/** A foreground/background pair, named the way it is actually used. */
export type Pair = {
  fg: keyof ColorRoles;
  bg: keyof ColorRoles;
  label: string;
  /** Expected to fail — ornament, not text. */
  ornament?: boolean;
};

export const PAIRS: Pair[] = [
  { fg: 'onSurface', bg: 'surface', label: 'Body text' },
  { fg: 'onSurfaceVariant', bg: 'surface', label: 'Secondary text' },
  { fg: 'onSurfaceFaint', bg: 'surface', label: 'Placeholders & meta' },
  { fg: 'primary', bg: 'surface', label: 'Wordmark, active tab' },
  { fg: 'goldInk', bg: 'surface', label: 'Gold-feeling headings' },
  { fg: 'onAccent', bg: 'accent', label: 'Primary button' },
  { fg: 'onPrimary', bg: 'primary', label: 'Secondary button' },
  { fg: 'onPrimaryContainer', bg: 'primaryContainer', label: 'Selected chip' },
  { fg: 'onSurface', bg: 'containerLowest', label: 'Text on a card' },
  { fg: 'error', bg: 'surface', label: 'Error text' },
  { fg: 'gold', bg: 'surface', label: 'Ornament — must not carry text', ornament: true },
];

export const NAV_ICONS: IconName[] = ['home', 'diya', 'temple', 'music', 'person'];

export const UTIL_ICONS: IconName[] = [
  'back', 'forward', 'close', 'check', 'bell', 'settings', 'search', 'calendar',
  'mapPin', 'star', 'heart', 'share', 'plus', 'minus', 'play', 'pause', 'globe',
  'logout', 'support', 'gift', 'sparkle', 'lotus', 'marigold', 'shankh',
];

/** Latin and Devanagari samples, sized so each step stays on one line. */
export const SAMPLES: Record<TypeVariant, { en: string; hi: string }> = {
  display: { en: 'Virtual Pooja', hi: 'वर्चुअल पूजा' },
  headlineLg: { en: 'Live Darshan', hi: 'लाइव दर्शन' },
  headlineMd: { en: 'Kashi Vishwanath', hi: 'काशी विश्वनाथ' },
  titleLg: { en: 'Popular Temples', hi: 'लोकप्रिय मंदिर' },
  titleMd: { en: 'Daily Gratitude', hi: 'दैनिक कृतज्ञता' },
  titleSm: { en: 'Service Fee', hi: 'सेवा शुल्क' },
  bodyLg: { en: 'Offer flowers to the deity', hi: 'देवता को पुष्प अर्पित करें' },
  bodyMd: { en: 'Varanasi, Uttar Pradesh', hi: 'वाराणसी, उत्तर प्रदेश' },
  bodySm: { en: 'Mangala Aarti · 3:00 AM', hi: 'मंगला आरती · प्रातः ३:००' },
  labelLg: { en: 'Pay Now', hi: 'अभी भुगतान करें' },
  labelMd: { en: 'Book Pooja', hi: 'पूजा बुक करें' },
  labelSm: { en: 'SECURE PAYMENT', hi: 'सुरक्षित भुगतान' },
  mantra: { en: 'Om Namah Shivaya', hi: 'ॐ नमः शिवाय' },
  numeral: { en: '108', hi: '१०८' },
};
