import {
  isResponseLanguageSetting,
  type Locale,
  type ResponseLanguageSetting,
} from '../i18n/resolve';

export const RESPONSE_LANGUAGE_POLICY_VERSION = 1 as const;

export interface ResponseLanguagePolicy {
  version: typeof RESPONSE_LANGUAGE_POLICY_VERSION;
  setting: ResponseLanguageSetting;
  interfaceLocale: Locale;
}

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English (en)',
  'zh-TW': 'Traditional Chinese (zh-TW)',
  ja: 'Japanese (ja)',
  de: 'German (de)',
};

const LOCALES = new Set<Locale>(['en', 'zh-TW', 'ja', 'de']);
const POLICY_TAG_PATTERN = /<response-language-policy version="(\d+)" setting="([^"]+)" interface-locale="([^"]+)">/g;

export function createResponseLanguagePolicy(
  setting: ResponseLanguageSetting,
  interfaceLocale: Locale,
): ResponseLanguagePolicy {
  return {
    version: RESPONSE_LANGUAGE_POLICY_VERSION,
    setting,
    interfaceLocale,
  };
}

export function isResponseLanguagePolicy(value: unknown): value is ResponseLanguagePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as Partial<Record<keyof ResponseLanguagePolicy, unknown>>;
  return (
    policy.version === RESPONSE_LANGUAGE_POLICY_VERSION &&
    isResponseLanguageSetting(policy.setting) &&
    typeof policy.interfaceLocale === 'string' &&
    LOCALES.has(policy.interfaceLocale as Locale)
  );
}

export function responseLanguagePolicyFromPrompt(prompt: unknown): ResponseLanguagePolicy | undefined {
  if (typeof prompt !== 'string') return undefined;
  const matches = [...prompt.matchAll(POLICY_TAG_PATTERN)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const candidate = {
      version: Number(match[1]),
      setting: match[2],
      interfaceLocale: match[3],
    };
    if (isResponseLanguagePolicy(candidate)) return candidate;
  }
  return undefined;
}

export function appendResponseLanguagePolicy(prompt: string, policy?: ResponseLanguagePolicy): string {
  if (!policy) return prompt;
  return `${prompt}\n\n${responseLanguageDirective(policy)}`;
}

export function responseLanguageDirective(policy: ResponseLanguagePolicy): string {
  const requirement =
    policy.setting === 'auto'
      ? [
          '1. Follow explicit output-language request(s) in the original current user question, including per-section requests.',
          '2. Otherwise, reply in the primary language of the user-authored prose in that question.',
          '3. If that is ambiguous, continue the language previously used by the user in this conversation.',
          `4. If it is still unclear, reply in ${LOCALE_NAMES[policy.interfaceLocale]} (the app interface language fallback).`,
        ]
      : [
          '1. Follow explicit output-language request(s) in the original current user question, including per-section requests.',
          `2. Otherwise, reply in ${LOCALE_NAMES[policy.setting]}.`,
        ];

  return [
    `<response-language-policy version="${policy.version}" setting="${policy.setting}" interface-locale="${policy.interfaceLocale}">`,
    'Apply this policy to any natural-language text in your response, in priority order:',
    ...requirement,
    'This policy changes only the language of natural-language text. It does not change the requested task, output modality, structure, or format.',
    'Determine language only from user-authored prose in the original current question and prior user turns. Do not infer it from these workflow instructions, other AI responses, quoted or source text, attachments, code, identifiers, URLs, or filenames.',
    'Preserve code, names, URLs, quotations, and source-language excerpts in their original form.',
    '</response-language-policy>',
  ].join('\n');
}
