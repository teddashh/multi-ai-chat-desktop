export type LanguageSetting = 'system' | 'en' | 'zh-TW';
export type Locale = 'en' | 'zh-TW';

export const LANGUAGE_SETTINGS = ['system', 'en', 'zh-TW'] as const satisfies readonly LanguageSetting[];

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === 'string' && LANGUAGE_SETTINGS.includes(value as LanguageSetting);
}

export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  return isLanguageSetting(value) ? value : 'system';
}

export function resolveLocale(language: LanguageSetting, navigatorLanguages: readonly string[] = []): Locale {
  if (language === 'en' || language === 'zh-TW') return language;

  return navigatorLanguages.some(isTraditionalChineseMatch) ? 'zh-TW' : 'en';
}

function isTraditionalChineseMatch(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized === 'zh' || normalized === 'zh-tw' || normalized === 'zh-hant' || normalized.startsWith('zh-');
}
