import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { modeName } from '../i18n/modes';
import type { Locale } from '../i18n/resolve';
import { formatI18n, t } from '../i18n/t';
import type { PreflightResult } from '../workflow/preflight';
import type { PreflightSubject } from './preflightFromResult';

export interface PreflightDialogModel {
  title: string;
  unavailable: { provider: AIProvider; label: string; reason: string }[];
  aliased: { provider: AIProvider; label: string; reason: string }[];
}

export function providerUnavailableReason(state: ProviderState | undefined, locale: Locale = 'en'): string {
  if (!state || state.webview !== 'loaded') return t('preflight.noWebview', locale);
  if (state.login === 'logged_out' || state.login === 'blocked') return t('preflight.needsLogin', locale);
  if (state.dom === 'unknown') return t('preflight.stale', locale);
  return t('preflight.unavailable', locale);
}

export function buildPreflightDialogModel(
  mode: PreflightSubject,
  preflight: PreflightResult,
  states: Record<AIProvider, ProviderState>,
  locale: Locale = 'en',
): PreflightDialogModel {
  const displayName = mode === 'brainstorm' ? t('preset.brainstorm.displayName', locale) : modeName(mode, locale);
  return {
    title: formatI18n(t('preflight.cannotStart', locale), { mode: displayName }),
    unavailable: preflight.unavailable.map((provider) => ({
      provider,
      label: AI_PROVIDERS[provider].name,
      reason: providerUnavailableReason(states[provider], locale),
    })),
    aliased: preflight.aliased.map((provider) => ({
      provider,
      label: AI_PROVIDERS[provider].name,
      reason: t('preflight.aliasedProvider', locale),
    })),
  };
}
