import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LanguageContext } from './context';
import { type Lang, type StringKey, STRINGS } from './strings';

const STORAGE_KEY = 'pooja.lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw === 'en' || raw === 'hi') setLangState(raw);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const toggleLang = useCallback(async () => {
    const next: Lang = lang === 'en' ? 'hi' : 'en';
    await setLang(next);
  }, [lang, setLang]);

  const t = useCallback((key: StringKey) => STRINGS[lang ?? 'hi'][key], [lang]);

  const value = useMemo(
    () => ({ lang, loading, setLang, toggleLang, t }),
    [lang, loading, setLang, toggleLang, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
