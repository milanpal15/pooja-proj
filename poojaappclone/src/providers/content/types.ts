import type { ImageSourcePropType } from 'react-native';

import type { Deity } from '@/constants/deities';
import type { Festival } from '@/constants/festivals';
import type { Seva } from '@/constants/poojas';
import type { Temple } from '@/constants/temples';

/** Shapes returned by the admin backend's public `/api/content` endpoint. */
export type RemoteDeity = {
  slug: string;
  name: string;
  title?: string;
  mark?: string;
  mantra?: string;
  imageUrl?: string;
  offerings?: string[];
  /**
   * How to DRAW this deity when no photograph is set.
   *
   * The sanctum builds a procedural murti from these. They used to live only
   * in `constants/deities.ts`, which meant a deity created in the dashboard
   * rendered grey and crownless — there was no bundled entry to match it to.
   * All optional; the app keeps its own defaults for whatever is missing.
   */
  accent?: string;
  body?: string;
  robe?: string;
  trim?: string;
  crown?: string;
  crescent?: boolean;
  serpent?: boolean;
  elephant?: boolean;
  mace?: boolean;
};
export type RemoteTemple = {
  slug: string;
  name: string;
  location?: string;
  deitySlug?: string;
  imageUrl?: string;
  aartiTime?: string;
  offerings?: string[];
  /** Whether real pooja booking is arranged with this temple. */
  bookingEnabled?: boolean;
  /** 0–5. Absent when nobody has entered one — do not invent a default. */
  rating?: number;
  reviews?: number;
  /** A YouTube or direct stream URL. Empty means this temple is not live. */
  liveUrl?: string;
  /**
   * Presentation, as the sanctum re-themes itself per temple, plus where the
   * pilgrimage map puts the pin and where the temple actually is. All used
   * to live only in `constants/temples.ts`, so a temple added from the
   * dashboard had no colours and no pin.
   */
  mark?: string;
  backdropFrom?: string;
  backdropTo?: string;
  accent?: string;
  trim?: string;
  idol?: string;
  mapX?: number;
  mapY?: number;
  lat?: number;
  lng?: number;
};
export type RemoteAarti = {
  _id: string;
  title: string;
  artist?: string;
  deitySlug?: string;
  audioUrl?: string;
  duration?: string;
  /** Which Bhajan shelf: morning | evening | meditation. */
  category?: string;
};

export type RemoteFestival = {
  _id: string;
  slug: string;
  name: string;
  nameHi?: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  deitySlug?: string;
};

export type RemoteSeva = {
  _id: string;
  slug: string;
  name: string;
  nameHi?: string;
  description?: string;
  descriptionHi?: string;
  price: number;
  duration?: string;
  templeSlug?: string;
  deitySlugs?: string[];
};

export type RemoteKnowledge = {
  _id: string;
  deitySlug: string;
  epithet?: string;
  epithetHi?: string;
  about?: string;
  aboutHi?: string;
  facts?: { k: string; kHi: string; v: string; vHi: string }[];
  texts?: string[];
  textsHi?: string[];
  festivals?: string[];
  festivalsHi?: string[];
};

export type RemoteReminder = {
  slug: string;
  title: string;
  titleHi?: string;
  body?: string;
  bodyHi?: string;
  hour: number;
  minute: number;
  icon?: string;
};

/**
 * An alert tone.
 *
 * `sound` is an uploaded or absolute URL, '' for silent, null for the
 * device's own default. It used to also accept a bare name like 'bell',
 * meaning a file compiled into the app; no audio ships in the bundle any
 * more, so a bare name now resolves to nothing and the tone falls back to
 * the device default rather than playing silence people cannot explain.
 */
export type RemoteTone = {
  slug: string;
  title: string;
  titleHi?: string;
  desc?: string;
  descHi?: string;
  sound?: string | null;
  icon?: string;
};

export type RemoteWallpaperStyle = {
  slug: string;
  title: string;
  titleHi?: string;
};

export type RemoteFaq = {
  _id: string;
  slug: string;
  category: string;
  categoryTitle?: string;
  categoryTitleHi?: string;
  question: string;
  questionHi?: string;
  answer: string;
  answerHi?: string;
};

export type RemoteHeroSlide = {
  _id: string;
  slug: string;
  /** `banner` = uploaded image; `html` = server-sanitised markup. Absent on old rows. */
  kind?: 'banner' | 'html';
  title: string;
  titleHi?: string;
  subtitle?: string;
  subtitleHi?: string;
  deitySlug?: string;
  href?: string;
  image?: string;
  html?: string;
  htmlHi?: string;
  ctaLabel?: string;
  ctaLabelHi?: string;
  ctaHref?: string;
  /** Small pill above the title ("9 nights"). */
  tag?: string;
  tagHi?: string;
  /** What a tap opens, as authored; the API resolves it into `href`. */
  target?: { type: string; ref?: string };
  /** Audience: the app shows a slide for its own language, or for 'all'. Absent = all. */
  language?: 'all' | 'hi' | 'en';
  enabled?: boolean;
  order?: number;
  startsAt?: string | null;
  endsAt?: string | null;
};

/** One tile / row / card inside a Home section. */
export type RemoteHomeItem = {
  title?: string;
  titleHi?: string;
  subtitle?: string;
  subtitleHi?: string;
  icon?: string;
  image?: string;
  href?: string;
  badge?: 'new' | 'soon' | 'special' | '';
  /** A feature-flag key; the item is hidden while that flag is off. */
  flag?: string;
  deitySlug?: string;
};

export type HomeSource =
  | 'hero'
  | 'astrologer'
  | 'grid'
  | 'festivals'
  | 'knowledge'
  | 'temples'
  | 'daily'
  | 'features'
  | 'darshan'
  | 'custom';

export type HomeTone = 'gold' | 'purple' | 'crimson' | 'forest' | 'maroon';
export type HomeLayoutKind = 'photo3' | 'book2' | 'list' | 'grid4';

/** One block of the dashboard-driven Home, already enabled and in-window server-side. */
export type RemoteHomeSection = {
  key: string;
  source: HomeSource;
  title?: string;
  titleHi?: string;
  tone?: HomeTone;
  layout?: HomeLayoutKind;
  items?: RemoteHomeItem[];
  footerLabel?: string;
  footerLabelHi?: string;
  footerHref?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  order?: number;
  enabled?: boolean;
};

export type RemoteAnnouncement = { title: string; body?: string; severity?: string };

export type Content = {
  deities: RemoteDeity[];
  temples: RemoteTemple[];
  aartis: RemoteAarti[];
  festivals: RemoteFestival[];
  sevas: RemoteSeva[];
  knowledge: RemoteKnowledge[];
  faqs: RemoteFaq[];
  hero: RemoteHeroSlide[];
  /** The dashboard's Home layout; null when the API served none (bundled default applies). */
  home: { sections: RemoteHomeSection[] } | null;
  reminders: RemoteReminder[];
  tones: RemoteTone[];
  wallpaperStyles: RemoteWallpaperStyle[];
  /** Flat key/value map: prasadDelivery, supportEmail, supportPhone… */
  settings: Record<string, string>;
  announcement: RemoteAnnouncement | null;
};

export type ContentContextValue = Content & {
  /** True until the first fetch settles (success or failure). */
  loading: boolean;
  /** Remote artwork for a deity id, ready to drop into <Image source>. */
  deityImage: (id: string) => ImageSourcePropType | undefined;
  /**
   * The artwork to actually render: admin-managed when the dashboard has one,
   * the bundled murti otherwise.
   *
   * Undefined when the dashboard has no artwork for this deity — screens
   * fall back to the procedural murti, which is why the palette and the
   * geometry flags live in the dashboard too.
   * Doing so is what made the deity row ignore the dashboard entirely — the
   * bundled art is the *fallback*, not the source of truth, and the app has
   * to keep working with the backend unreachable either way.
   */
  deityArt: (id: string) => ImageSourcePropType | undefined;
  /**
   * The deities and temples the screens render, in the app's own shape.
   *
   * These are the lists to use. The raw `deities` / `temples` arrays spread
   * in above are the dashboard's rows, kept for the few places that need a
   * field the app shape does not carry (darshan reads `liveUrl`).
   *
   * Empty is a real answer. Nothing is compiled into the app any more, so
   * an unpublished dashboard means empty states — which is how an unfilled
   * dashboard is supposed to look.
   */
  deityList: Deity[];
  templeList: Temple[];
  /**
   * A tone's audio, ready for `useAudioPlayer` — null when there is nothing
   * to play (silent, device default, or no file uploaded yet).
   */
  toneSound: (slug: string) => { uri: string } | null;
  /** A deity's display name for a slug; the slug itself if unknown. */
  deityName: (slug: string) => string;
  /**
   * Look one up by slug, falling back to the first in the list.
   *
   * Returns undefined when there is nothing at all — an unfilled dashboard
   * — so callers must handle an empty sanctum rather than assuming a deity
   * always exists, which the bundled catalogue used to guarantee.
   */
  deityById: (id?: string | string[]) => Deity | undefined;
  templeById: (id?: string | string[]) => Temple | undefined;
  /**
   * Whether a temple accepts real pooja bookings, per the admin dashboard.
   *
   * Only an explicit `false` disables. An unknown temple — backend
   * unreachable, or a slug the dashboard has never seen — reads as enabled,
   * matching the schema's own default rather than making every temple look
   * broken while offline.
   *
   * That is a deliberate fail-open, and it is the weaker half of this
   * feature: a temple switched off while the device is offline still shows
   * its button. The fix is the cached last-known-good content described in
   * the LLD, not a different default here.
   */
  bookingEnabled: (slug: string) => boolean;
  /**
   * Upcoming vrats and festivals, soonest first.
   *
   * Prefers the admin-managed calendar and falls back to the bundled list
   * when the backend is unreachable — or when the backend has one but every
   * date in it has already passed, which is the failure the bundled list also
   * suffers from. Either source can run dry; the screens show an empty state.
   */
  upcomingFestivals: (limit?: number) => Festival[];
  /**
   * A temple's real rating, or undefined.
   *
   * Every card used to print the same hardcoded "4.9 stars (25k reviews)"
   * from one i18n string — invented social proof on a screen asking for
   * money. Undefined means the caller hides the row.
   */
  templeRating: (slug: string) => { rating: number; reviews?: number } | undefined;
  /**
   * A numeric app setting, with the bundled value as the fallback.
   *
   * Settings arrive as strings because the dashboard edits them as text; a
   * bad value falls back rather than producing NaN in a price.
   */
  setting: (key: string, fallback: number) => number;
  /** A string app setting. Empty string when unset, so callers can hide UI. */
  settingText: (key: string) => string;
  /**
   * Bookable rites for a temple, admin-priced.
   *
   * Prices used to be compiled into the app, so changing one meant a store
   * release. Falls back to the bundled catalogue when the backend is
   * unreachable — an offline devotee still sees a price, just last week's.
   */
  sevasFor: (opts: { templeSlug?: string; deitySlug?: string }) => Seva[];
};
