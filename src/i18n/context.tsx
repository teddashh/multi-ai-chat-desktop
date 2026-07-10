import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { I18nKey } from './keys';
import { normalizeLanguageSetting, resolveLocale, type LanguageSetting, type Locale } from './resolve';
import { t as lookup } from './t';

export interface I18nContextValue {
  locale: Locale;
  language: LanguageSetting;
  t: (key: I18nKey) => string;
  setLanguage: (language: LanguageSetting) => void;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({
  language,
  children,
}: {
  language: LanguageSetting;
  children: ReactNode;
}) {
  const [currentLanguage, setCurrentLanguage] = useState<LanguageSetting>(() => normalizeLanguageSetting(language));

  useEffect(() => {
    setCurrentLanguage(normalizeLanguageSetting(language));
  }, [language]);

  const navigatorLanguages = typeof navigator === 'undefined' ? [] : Array.from(navigator.languages ?? [navigator.language]);
  const locale = resolveLocale(currentLanguage, navigatorLanguages);
  const translate = useCallback((key: I18nKey) => lookup(key, locale), [locale]);
  const setLanguage = useCallback((next: LanguageSetting) => setCurrentLanguage(normalizeLanguageSetting(next)), []);
  const value = useMemo(
    () => ({ locale, language: currentLanguage, t: translate, setLanguage }),
    [currentLanguage, locale, setLanguage, translate],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
