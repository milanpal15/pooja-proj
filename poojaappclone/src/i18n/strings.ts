import { en } from './en';
import { hi } from './hi';

export type Lang = 'en' | 'hi';

/** UI strings. Proper nouns (deity/temple names) stay in their own data. */
export const STRINGS = { en, hi } as const;

export type StringKey = keyof (typeof STRINGS)['en'];
