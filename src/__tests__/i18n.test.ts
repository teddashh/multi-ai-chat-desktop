import { describe, expect, it } from 'vitest';
import { CHAT_MODES } from '../../shared/constants';
import { en } from '../i18n/en';
import { I18N_KEYS } from '../i18n/keys';
import { resolveLocale } from '../i18n/resolve';
import { zhTW } from '../i18n/zh-TW';

describe('i18n dictionaries', () => {
  it('defines every key in English and Traditional Chinese with non-empty values', () => {
    for (const key of I18N_KEYS) {
      expect(en[key], `en.${key}`).toEqual(expect.any(String));
      expect(en[key].trim(), `en.${key}`).not.toBe('');
      expect(zhTW[key], `zh-TW.${key}`).toEqual(expect.any(String));
      expect(zhTW[key].trim(), `zh-TW.${key}`).not.toBe('');
    }
  });

  it('does not include CJK characters in English strings', () => {
    for (const key of I18N_KEYS) {
      expect(en[key], key).not.toMatch(/[一-鿿]/);
    }
  });

  it('keeps Traditional Chinese mode names aligned with the shipped constants', () => {
    for (const mode of ['free', 'debate', 'consult', 'coding', 'roundtable'] as const) {
      expect(zhTW[`mode.${mode}.name`]).toBe(CHAT_MODES[mode].name);
    }
  });

  it('resolves system and explicit locale choices', () => {
    expect(resolveLocale('system', ['zh'])).toBe('zh-TW');
    expect(resolveLocale('system', ['zh-CN'])).toBe('zh-TW');
    expect(resolveLocale('system', ['zh-TW'])).toBe('zh-TW');
    expect(resolveLocale('system', ['en-US'])).toBe('en');
    expect(resolveLocale('en', ['zh-TW'])).toBe('en');
    expect(resolveLocale('zh-TW', ['en-US'])).toBe('zh-TW');
  });
});
