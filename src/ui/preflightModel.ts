import { AI_PROVIDERS, CHAT_MODES } from '../../shared/constants';
import type { AIProvider, ChatMode, ProviderState } from '../../shared/types';
import type { PreflightResult } from '../workflow/preflight';

export interface PreflightDialogModel {
  title: string;
  unavailable: { provider: AIProvider; label: string; reason: string }[];
  aliased: { provider: AIProvider; label: string; reason: string }[];
}

export function providerUnavailableReason(state: ProviderState | undefined): string {
  if (!state || state.webview !== 'loaded') return 'No webview';
  if (state.login === 'logged_out' || state.login === 'blocked') return 'Needs login';
  if (state.dom === 'unknown') return 'Stale';
  return 'Unavailable';
}

export function buildPreflightDialogModel(
  mode: Exclude<ChatMode, 'free'>,
  preflight: PreflightResult,
  states: Record<AIProvider, ProviderState>,
): PreflightDialogModel {
  return {
    title: `Cannot start ${CHAT_MODES[mode].name} - the following providers are unavailable:`,
    unavailable: preflight.unavailable.map((provider) => ({
      provider,
      label: AI_PROVIDERS[provider].name,
      reason: providerUnavailableReason(states[provider]),
    })),
    aliased: preflight.aliased.map((provider) => ({
      provider,
      label: AI_PROVIDERS[provider].name,
      reason: 'two roles resolve to the same provider',
    })),
  };
}
