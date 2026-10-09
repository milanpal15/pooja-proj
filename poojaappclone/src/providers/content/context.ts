import { createContext } from 'react';

import type { Content, ContentContextValue } from './types';

export const EMPTY: Content = {
  deities: [],
  temples: [],
  aartis: [],
  festivals: [],
  sevas: [],
  knowledge: [],
  faqs: [],
  hero: [],
  home: null,
  reminders: [],
  tones: [],
  wallpaperStyles: [],
  settings: {},
  announcement: null,
};

export const ContentContext = createContext<ContentContextValue>({
  ...EMPTY,
  loading: true,
  // Outside a provider nothing has been fetched, so there is nothing to
  // show — the same answer the provider gives before anything loads.
  deityList: [],
  templeList: [],
  toneSound: () => null,
  deityName: (slug) => slug,
  deityById: () => undefined,
  templeById: () => undefined,
  deityImage: () => undefined,
  // Outside a provider there is no dashboard, so the bundled murti is it.
  deityArt: () => undefined,
  bookingEnabled: () => true,
  // Outside a provider nothing has been fetched, so there is nothing.
  upcomingFestivals: () => [],
  templeRating: () => undefined,
  setting: (_k, fallback) => fallback,
  settingText: () => '',
  sevasFor: () => [],
});
