import type { AIProvider, ProviderState } from '../../shared/types';
import { isSendable } from '../workflow';

export interface FreeTargetSelection {
  targets: AIProvider[];
  defaultsInitialized: boolean;
  userTouched: boolean;
}

export function defaultTargets(states: Record<AIProvider, ProviderState>, providers: AIProvider[]): AIProvider[] {
  return providers.filter((provider) => isSendable(states[provider]));
}

export function applyFreeTargetDefaults(selection: FreeTargetSelection, defaults: AIProvider[]): FreeTargetSelection {
  if (selection.userTouched || selection.defaultsInitialized || defaults.length === 0) return selection;
  return { ...selection, targets: defaults, defaultsInitialized: true };
}

export function markFreeTargetsTouched(selection: FreeTargetSelection, targets: AIProvider[]): FreeTargetSelection {
  return { ...selection, targets, userTouched: true };
}

export function toggleTarget(selected: AIProvider[], provider: AIProvider): AIProvider[] {
  return selected.includes(provider) ? selected.filter((item) => item !== provider) : [...selected, provider];
}

export function freeModeTargets(selected: AIProvider[], states: Record<AIProvider, ProviderState>): AIProvider[] {
  return selected.filter((provider) => isSendable(states[provider]));
}

export function hasEffectiveFreeModeTargets(selected: AIProvider[], states: Record<AIProvider, ProviderState>): boolean {
  return freeModeTargets(selected, states).length > 0;
}
