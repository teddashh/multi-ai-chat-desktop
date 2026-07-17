import type { AIProvider, ProviderState } from '../../shared/types';

export interface OverlayGuardHost {
  hide: (provider: AIProvider) => Promise<void> | void;
  show: (provider: AIProvider) => Promise<void> | void;
}

export class OverlayGuardCounter {
  private openCount = 0;
  private hiddenProviders: AIProvider[] = [];
  private commandChains = new Map<AIProvider, Promise<void>>();

  open(loadedProviders: AIProvider[], host: OverlayGuardHost): void {
    this.openCount += 1;
    if (this.openCount !== 1) return;
    this.hiddenProviders = [...loadedProviders];
    for (const provider of this.hiddenProviders) this.enqueue(provider, () => host.hide(provider));
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
      this.enqueue(provider, () => host.hide(provider));
    }
  }

  close(host: OverlayGuardHost): void {
    if (this.openCount === 0) return;
    this.openCount -= 1;
    if (this.openCount !== 0) return;
    const toRestore = this.hiddenProviders;
    this.hiddenProviders = [];
    for (const provider of toRestore) this.enqueue(provider, () => host.show(provider));
  }

  reset(): void {
    this.openCount = 0;
    this.hiddenProviders = [];
  }

  get count(): number {
    return this.openCount;
  }

  private enqueue(provider: AIProvider, command: () => Promise<void> | void): void {
    const previous = this.commandChains.get(provider);
    if (!previous) {
      const pending = runOverlayCommand(command);
      if (pending) this.track(provider, pending);
      return;
    }

    this.track(
      provider,
      previous.then(() => runOverlayCommand(command)).then(() => undefined),
    );
  }

  private track(provider: AIProvider, pending: Promise<void>): void {
    this.commandChains.set(provider, pending);
    void pending.then(() => {
      if (this.commandChains.get(provider) === pending) this.commandChains.delete(provider);
    });
  }
}

function runOverlayCommand(command: () => Promise<void> | void): Promise<void> | undefined {
  try {
    const result = command();
    if (!result || typeof result.then !== 'function') return undefined;
    return Promise.resolve(result).catch(() => undefined);
  } catch {
    return undefined;
  }
}

export const globalOverlayGuard = new OverlayGuardCounter();

export function loadedProvidersFromStates(states: Record<AIProvider, ProviderState>, providers: AIProvider[]): AIProvider[] {
  return providers.filter((provider) => states[provider].webview === 'loaded');
}
