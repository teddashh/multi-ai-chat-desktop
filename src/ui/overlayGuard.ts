import type { AIProvider, ProviderState } from '../../shared/types';

export interface OverlayGuardHost {
  hide: (provider: AIProvider) => Promise<void> | void;
  show: (provider: AIProvider) => Promise<void> | void;
}

export class OverlayGuardCounter {
  private openCount = 0;
  private hiddenProviders: AIProvider[] = [];

  open(loadedProviders: AIProvider[], host: OverlayGuardHost): void {
    this.openCount += 1;
    if (this.openCount !== 1) return;
    this.hiddenProviders = [...loadedProviders];
    for (const provider of this.hiddenProviders) void host.hide(provider);
  }

  reconcile(loadedProviders: AIProvider[], host: OverlayGuardHost): void {
    if (this.openCount === 0) return;
    const loaded = new Set(loadedProviders);
    this.hiddenProviders = this.hiddenProviders.filter((provider) => loaded.has(provider));
    const hidden = new Set(this.hiddenProviders);
    for (const provider of loadedProviders) {
      if (hidden.has(provider)) continue;
      this.hiddenProviders.push(provider);
      hidden.add(provider);
      void host.hide(provider);
    }
  }

  close(host: OverlayGuardHost): void {
    if (this.openCount === 0) return;
    this.openCount -= 1;
    if (this.openCount !== 0) return;
    const toRestore = this.hiddenProviders;
    this.hiddenProviders = [];
    for (const provider of toRestore) void host.show(provider);
  }

  reset(): void {
    this.openCount = 0;
    this.hiddenProviders = [];
  }

  get count(): number {
    return this.openCount;
  }
}

export const globalOverlayGuard = new OverlayGuardCounter();

export function loadedProvidersFromStates(states: Record<AIProvider, ProviderState>, providers: AIProvider[]): AIProvider[] {
  return providers.filter((provider) => states[provider].webview === 'loaded');
}
