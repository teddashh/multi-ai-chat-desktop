import type { I18nKey } from './keys';
import { de } from './de';
import { en } from './en';
import { ja } from './ja';
import { zhTW } from './zh-TW';
import type { Locale } from './resolve';

const DICTIONARIES: Record<Locale, Record<I18nKey, string>> = {
  en,
  'zh-TW': zhTW,
  ja,
  de,
};

export function t(key: I18nKey, locale: Locale): string {
  return DICTIONARIES[locale][key];
}

export function formatI18n(template: string, values: Record<string, string | number | undefined>): string {
  return Object.entries(values).reduce(
    (current, [name, value]) => current.split(`{${name}}`).join(value == null ? 'unknown' : String(value)),
    template,
  );
}
