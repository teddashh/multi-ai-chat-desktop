import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';
import type { Locale } from '../i18n/resolve';
import { formatI18n, t } from '../i18n/t';

export type AdapterSelectorRef =
  | string
  | {
      selector?: string;
      textIncludes?: string;
      textExcludes?: string;
    };

export interface AdapterPermissionSelectorDetails {
  responseSelectors?: readonly AdapterSelectorRef[];
  loginDetectors?: readonly AdapterSelectorRef[];
  loggedOutDetectors?: readonly AdapterSelectorRef[];
  thinkingDetectors?: readonly AdapterSelectorRef[];
  inputSelectors?: readonly AdapterSelectorRef[];
  sendButtonSelectors?: readonly AdapterSelectorRef[];
  stopButtonSelectors?: readonly AdapterSelectorRef[];
}

export interface AdapterPermissionLine {
  title: string;
  detail: string;
  selectors?: string[];
}

export interface AdapterPermissionSummary {
  provider: AIProvider;
  providerName: string;
  selectorDetailsAvailable: boolean;
  reads: AdapterPermissionLine[];
  writes: AdapterPermissionLine[];
  cannot: AdapterPermissionLine[];
  note?: string;
}

export function buildAdapterPermissionSummary(
  provider: AIProvider,
  selectors?: AdapterPermissionSelectorDetails,
  locale: Locale = 'en',
): AdapterPermissionSummary {
  const providerName = AI_PROVIDERS[provider].name;
  const responseSelectors = normalizeSelectorRefs(selectors?.responseSelectors, locale);
  const loginSelectors = normalizeSelectorRefs(selectors?.loginDetectors, locale);
  const loggedOutSelectors = normalizeSelectorRefs(selectors?.loggedOutDetectors, locale);
  const thinkingSelectors = normalizeSelectorRefs(selectors?.thinkingDetectors, locale);
  const inputSelectors = normalizeSelectorRefs(selectors?.inputSelectors, locale);
  const sendSelectors = normalizeSelectorRefs(selectors?.sendButtonSelectors, locale);
  const stopSelectors = normalizeSelectorRefs(selectors?.stopButtonSelectors, locale);
  const selectorDetailsAvailable =
    responseSelectors.length > 0 ||
    loginSelectors.length > 0 ||
    loggedOutSelectors.length > 0 ||
    thinkingSelectors.length > 0 ||
    inputSelectors.length > 0 ||
    sendSelectors.length > 0 ||
    stopSelectors.length > 0;

  return {
    provider,
    providerName,
    selectorDetailsAvailable,
    reads: [
      {
        title: t('provider.access.replyTitle', locale),
        detail: responseSelectors.length
          ? formatI18n(t('provider.access.replyDetailWithSelectors', locale), { provider: providerName })
          : t('provider.access.replyDetailGeneric', locale),
        selectors: optionalSelectors(responseSelectors),
      },
      {
        title: t('provider.access.statusTitle', locale),
        detail:
          loginSelectors.length || loggedOutSelectors.length || thinkingSelectors.length
            ? formatI18n(t('provider.access.statusDetailWithSelectors', locale), { provider: providerName })
            : t('provider.access.statusDetailGeneric', locale),
        selectors: optionalSelectors([...loginSelectors, ...loggedOutSelectors, ...thinkingSelectors]),
      },
      {
        title: t('provider.access.composerVerifyTitle', locale),
        detail: t('provider.access.composerVerifyDetail', locale),
        selectors: optionalSelectors(inputSelectors),
      },
      {
        title: t('provider.access.diagnosticsTitle', locale),
        detail: t('provider.access.diagnosticsDetail', locale),
      },
    ],
    writes: [
      {
        title: t('provider.access.promptComposerTitle', locale),
        detail: inputSelectors.length
          ? formatI18n(t('provider.access.promptComposerDetailWithSelectors', locale), { provider: providerName })
          : formatI18n(t('provider.access.promptComposerDetailGeneric', locale), { provider: providerName }),
        selectors: optionalSelectors(inputSelectors),
      },
      {
        title: t('provider.access.sendControlTitle', locale),
        detail: sendSelectors.length
          ? formatI18n(t('provider.access.sendControlDetailWithSelectors', locale), { provider: providerName })
          : formatI18n(t('provider.access.sendControlDetailGeneric', locale), { provider: providerName }),
        selectors: optionalSelectors(sendSelectors),
      },
      {
        title: t('provider.access.enterFallbackTitle', locale),
        detail: t('provider.access.enterFallbackDetail', locale),
        selectors: optionalSelectors(inputSelectors),
      },
      {
        title: t('provider.access.stopControlTitle', locale),
        detail: t('provider.access.stopControlDetail', locale),
        selectors: optionalSelectors(stopSelectors),
      },
    ],
    cannot: [
      {
        title: t('provider.access.cannotCredentialsTitle', locale),
        detail: t('provider.access.cannotCredentialsDetail', locale),
      },
      {
        title: t('provider.access.cannotOtherContextsTitle', locale),
        detail: t('provider.access.cannotOtherContextsDetail', locale),
      },
      {
        title: t('provider.access.cannotRelayTitle', locale),
        detail: t('provider.access.cannotRelayDetail', locale),
      },
    ],
    note: selectorDetailsAvailable
      ? undefined
      : t('provider.access.noSelectorDetails', locale),
  };
}

function normalizeSelectorRefs(selectors: readonly AdapterSelectorRef[] | undefined, locale: Locale): string[] {
  if (!selectors) return [];
  const normalized = selectors.map((selector) => formatSelectorRef(selector, locale)).filter((selector): selector is string => selector.length > 0);
  return [...new Set(normalized)];
}

function formatSelectorRef(selector: AdapterSelectorRef, locale: Locale): string {
  if (typeof selector === 'string') return selector.trim();
  const base = selector.selector?.trim() ?? '';
  if (!base) return '';
  const clauses = [
    selector.textIncludes ? formatI18n(t('provider.access.selectorTextIncludes', locale), { value: selector.textIncludes }) : '',
    selector.textExcludes ? formatI18n(t('provider.access.selectorTextExcludes', locale), { value: selector.textExcludes }) : '',
  ].filter(Boolean);
  return clauses.length ? `${base} (${clauses.join('; ')})` : base;
}

function optionalSelectors(selectors: string[]): string[] | undefined {
  return selectors.length > 0 ? selectors : undefined;
}
