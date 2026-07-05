import type { AIProvider, ProviderState } from '../../shared/types';

export function visibleLoadedProviders(
  states: Record<AIProvider, ProviderState>,
  userHidden: ReadonlySet<AIProvider>,
  providers: AIProvider[],
): AIProvider[] {
  return providers.filter((provider) => states[provider].webview === 'loaded' && !userHidden.has(provider));
}
