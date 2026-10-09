import { createContext } from 'react';

import { type Lang, type StringKey, STRINGS } from './strings';

export type LanguageContextValue = {
  lang: Lang | null;
  loading: boolean;
  setLang: (l: Lang) => Promise<void>;
  toggleLang: () => Promise<void>;
  t: (key: StringKey) => string;
};

export const LanguageContext = createContext<LanguageContextValue>({
  lang: null,
  loading: true,
  setLang: async () => {},
  toggleLang: async () => {},
  t: (k) => STRINGS.hi[k],
});
