import { describe, expect, it } from 'vitest';
import { CHAT_MODES } from '../../shared/constants';
import { de } from '../i18n/de';
import { en } from '../i18n/en';
import { I18N_KEYS } from '../i18n/keys';
import { ja } from '../i18n/ja';
import {
  LANGUAGE_SETTINGS,
  RESPONSE_LANGUAGE_SETTINGS,
  normalizeLanguageSetting,
  normalizeResponseLanguageSetting,
  resolveLocale,
} from '../i18n/resolve';
import { zhTW } from '../i18n/zh-TW';

describe('i18n dictionaries', () => {
  const dictionaries = { en, 'zh-TW': zhTW, ja, de } as const;

  it('defines every key in every language with non-empty values', () => {
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary).sort(), locale).toEqual([...I18N_KEYS].sort());
      for (const key of I18N_KEYS) {
        expect(dictionary[key], `${locale}.${key}`).toEqual(expect.any(String));
        expect(dictionary[key].trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('preserves interpolation placeholders in every translation', () => {
    const placeholders = (value: string) => [...value.matchAll(/\{[^}]+\}/g)].map(([match]) => match).sort();

    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      for (const key of I18N_KEYS) {
        expect(placeholders(dictionary[key]), `${locale}.${key}`).toEqual(placeholders(en[key]));
      }
    }
  });

  it('does not include CJK characters in English or German strings', () => {
    for (const [locale, dictionary] of Object.entries({ en, de })) {
      for (const key of I18N_KEYS) {
        expect(dictionary[key], `${locale}.${key}`).not.toMatch(/[一-鿿]/);
      }
    }
  });

  it('keeps Traditional Chinese mode names aligned with the shipped constants', () => {
    for (const mode of ['free', 'debate', 'consult', 'coding', 'roundtable'] as const) {
      expect(zhTW[`mode.${mode}.name`]).toBe(CHAT_MODES[mode].name);
    }
  });

  it('normalizes supported language settings', () => {
    expect(LANGUAGE_SETTINGS).toEqual(['system', 'en', 'zh-TW', 'ja', 'de']);
    expect(normalizeLanguageSetting('ja')).toBe('ja');
    expect(normalizeLanguageSetting('de')).toBe('de');
    expect(normalizeLanguageSetting('ja-JP')).toBe('system');
    expect(normalizeLanguageSetting('fr')).toBe('system');
  });

  it('normalizes response language settings independently from the interface language', () => {
    expect(RESPONSE_LANGUAGE_SETTINGS).toEqual(['auto', 'en', 'zh-TW', 'ja', 'de']);
    expect(normalizeResponseLanguageSetting('auto')).toBe('auto');
    expect(normalizeResponseLanguageSetting('en')).toBe('en');
    expect(normalizeResponseLanguageSetting('zh-TW')).toBe('zh-TW');
    expect(normalizeResponseLanguageSetting('fr')).toBe('auto');
    expect(normalizeResponseLanguageSetting('system')).toBe('auto');
  });

  it('resolves system locales in navigator preference order', () => {
    expect(resolveLocale('system', ['zh'])).toBe('zh-TW');
    expect(resolveLocale('system', ['zh-CN'])).toBe('zh-TW');
    expect(resolveLocale('system', ['zh-TW'])).toBe('zh-TW');
    expect(resolveLocale('system', ['ja'])).toBe('ja');
    expect(resolveLocale('system', ['ja-JP'])).toBe('ja');
    expect(resolveLocale('system', ['JA_jp'])).toBe('ja');
    expect(resolveLocale('system', ['de'])).toBe('de');
    expect(resolveLocale('system', ['de-DE'])).toBe('de');
    expect(resolveLocale('system', ['fr-FR', 'de-AT', 'ja-JP'])).toBe('de');
    expect(resolveLocale('system', ['ja-JP', 'de-DE'])).toBe('ja');
    expect(resolveLocale('system', ['en-US'])).toBe('en');
    expect(resolveLocale('system', ['fr-FR'])).toBe('en');
  });

  it('keeps explicit locale choices regardless of system locale', () => {
    expect(resolveLocale('en', ['zh-TW'])).toBe('en');
    expect(resolveLocale('zh-TW', ['en-US'])).toBe('zh-TW');
    expect(resolveLocale('ja', ['de-DE'])).toBe('ja');
    expect(resolveLocale('de', ['ja-JP'])).toBe('de');
  });
});
