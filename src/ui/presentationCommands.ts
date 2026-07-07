import type { AIProvider, ProviderState } from '../../shared/types';
import type { PresentationByProvider, WebviewPresentationState } from './presentation';

export interface PresentationCommandHost {
  close: (provider: AIProvider) => Promise<unknown>;
  hide: (provider: AIProvider) => Promise<unknown>;
  open: (provider: AIProvider, bounds: DOMRectReadOnly) => Promise<unknown>;
  setBounds: (provider: AIProvider, bounds: DOMRectReadOnly) => Promise<unknown>;
  show: (provider: AIProvider) => Promise<unknown>;
}

interface PresentationCommandGuard {
  shouldContinue?: () => boolean;
  currentWebview?: () => ProviderState['webview'];
}

export async function applyPresentationTransitionCommand({
  host,
  provider,
  state,
  bounds,
  webview,
  shouldContinue = () => true,
  currentWebview = () => webview,
}: {
  host: PresentationCommandHost;
  provider: AIProvider;
  state: WebviewPresentationState;
  bounds: DOMRectReadOnly;
  webview: ProviderState['webview'];
} & PresentationCommandGuard): Promise<void> {
  if (state === 'chip') {
    currentWebview();
    if (!shouldContinue()) return;
    await host.close(provider);
    return;
  }

  const firstWebview = currentWebview();
  if (!shouldContinue()) return;

  if (firstWebview === 'loaded') {
    await host.show(provider);

    const boundsWebview = currentWebview();
    if (!shouldContinue() || boundsWebview !== 'loaded') return;
    await host.setBounds(provider, bounds);
    return;
  }

  await host.open(provider, bounds);
}

export async function applyCenterStageCommand({
  host,
  provider,
  bounds,
  overlappingProviders,
  shouldContinue = () => true,
  currentWebview = () => 'loaded',
}: {
  host: PresentationCommandHost;
  provider: AIProvider;
  bounds: DOMRectReadOnly;
  overlappingProviders: readonly AIProvider[];
  shouldContinue?: () => boolean;
  currentWebview?: (provider: AIProvider) => ProviderState['webview'];
}): Promise<void> {
  if (!shouldContinue() || currentWebview(provider) !== 'loaded') return;
  await host.setBounds(provider, bounds);
  for (const candidate of overlappingProviders) {
    if (!shouldContinue() || currentWebview(candidate) !== 'loaded') return;
    await host.hide(candidate);
  }
}

export async function applyCenterHiddenCommands({
  host,
  previousHidden,
  nextHidden,
  snapshot,
  shouldContinue = () => true,
  restoreRemoved = true,
}: {
  host: Pick<PresentationCommandHost, 'hide' | 'show'>;
  previousHidden: ReadonlySet<AIProvider>;
  nextHidden: ReadonlySet<AIProvider>;
  snapshot: () => {
    states: Record<AIProvider, ProviderState>;
    presentation: PresentationByProvider;
    userHidden: ReadonlySet<AIProvider>;
    overlayGuardOpen: boolean;
  };
  shouldContinue?: () => boolean;
  restoreRemoved?: boolean;
}): Promise<void> {
  if (restoreRemoved) {
    for (const provider of previousHidden) {
      if (nextHidden.has(provider)) continue;
      const current = snapshot();
      if (!shouldContinue()) return;
      if (current.overlayGuardOpen) continue;
      if (current.states[provider]?.webview === 'loaded' && !current.userHidden.has(provider) && current.presentation[provider] !== 'chip') {
        await host.show(provider);
      }
    }
  }

  for (const provider of nextHidden) {
    if (previousHidden.has(provider)) continue;
    const current = snapshot();
    if (!shouldContinue()) return;
    if (current.states[provider]?.webview === 'loaded') await host.hide(provider);
  }
}

export async function waitForPresentationTargetBounds({
  getBounds,
  waitFrame,
  shouldContinue = () => true,
  maxFrames = 6,
}: {
  getBounds: () => DOMRectReadOnly | undefined;
  waitFrame: () => Promise<void>;
  shouldContinue?: () => boolean;
  maxFrames?: number;
}): Promise<DOMRectReadOnly | undefined> {
  for (let frame = 0; frame <= maxFrames; frame += 1) {
    if (!shouldContinue()) return undefined;
    const bounds = getBounds();
    if (bounds) return bounds;
    if (frame === maxFrames) return undefined;
    await waitFrame();
  }
  return undefined;
}
