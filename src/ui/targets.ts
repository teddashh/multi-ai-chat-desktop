import type { AIProvider, ProviderState } from '../../shared/types';
import { isSendable } from '../workflow';

export function defaultTargets(states: Record<AIProvider, ProviderState>, providers: AIProvider[]): AIProvider[] {
  return providers.filter((provider) => isSendable(states[provider]));
}

export function toggleTarget(selected: AIProvider[], provider: AIProvider): AIProvider[] {
  return selected.includes(provider) ? selected.filter((item) => item !== provider) : [...selected, provider];
}

export function freeModeTargets(selected: AIProvider[], states: Record<AIProvider, ProviderState>): AIProvider[] {
  return selected.filter((provider) => isSendable(states[provider]));
}
