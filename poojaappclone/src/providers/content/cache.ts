import type { Content } from './types';

/** Where the last good /api/content response is kept. */
export const CACHE_KEY = 'pooja.content.v1';

export const normalise = (data: Partial<Content> | null): Content => ({
  deities: data?.deities ?? [],
  temples: data?.temples ?? [],
  aartis: data?.aartis ?? [],
  festivals: data?.festivals ?? [],
  sevas: data?.sevas ?? [],
  knowledge: data?.knowledge ?? [],
  faqs: data?.faqs ?? [],
  hero: data?.hero ?? [],
  // Absent or malformed means "the API served no layout", which is different
  // from an empty list: null makes Home fall back to its bundled default.
  home: Array.isArray(data?.home?.sections) ? { sections: data.home.sections } : null,
  reminders: data?.reminders ?? [],
  tones: data?.tones ?? [],
  wallpaperStyles: data?.wallpaperStyles ?? [],
  settings: data?.settings ?? {},
  announcement: data?.announcement ?? null,
});
