export type LanguageSetting = 'system' | 'en' | 'zh-TW' | 'ja' | 'de';
export type Locale = Exclude<LanguageSetting, 'system'>;
export type ResponseLanguageSetting = 'auto' | Locale;

export const LANGUAGE_SETTINGS = ['system', 'en', 'zh-TW', 'ja', 'de'] as const satisfies readonly LanguageSetting[];
export const RESPONSE_LANGUAGE_SETTINGS = ['auto', 'en', 'zh-TW', 'ja', 'de'] as const satisfies readonly ResponseLanguageSetting[];

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === 'string' && LANGUAGE_SETTINGS.includes(value as LanguageSetting);
}

export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  return isLanguageSetting(value) ? value : 'system';
}

export function isResponseLanguageSetting(value: unknown): value is ResponseLanguageSetting {
  return typeof value === 'string' && RESPONSE_LANGUAGE_SETTINGS.includes(value as ResponseLanguageSetting);
}

export function normalizeResponseLanguageSetting(value: unknown): ResponseLanguageSetting {
  return isResponseLanguageSetting(value) ? value : 'auto';
}

export function resolveLocale(language: LanguageSetting, navigatorLanguages: readonly string[] = []): Locale {
  if (language !== 'system') return language;

  for (const navigatorLanguage of navigatorLanguages) {
    const locale = localeFromNavigatorLanguage(navigatorLanguage);
    if (locale) return locale;
  }

  return 'en';
}

function localeFromNavigatorLanguage(language: string): Locale | undefined {
  const normalized = language.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-TW';
  if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja';
  if (normalized === 'de' || normalized.startsWith('de-')) return 'de';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return undefined;
}
