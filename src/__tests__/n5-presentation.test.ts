import { describe, expect, it, vi } from 'vitest';
import type { AIProvider, ProviderState } from '../../shared/types';
import {
  centerHiddenProviders,
  centerPresentationProvider,
  chipProviders,
  defaultPresentation,
  normalizePresentation,
  restorableOpenProviders,
  setProviderPresentation,
  sideProviders,
} from '../ui/presentation';
import { OverlayGuardCounter } from '../ui/overlayGuard';
import {
  applyCenterHiddenCommands,
  applyCenterStageCommand,
  applyPresentationTransitionCommand,
  waitForPresentationTargetBounds,
  type PresentationCommandHost,
} from '../ui/presentationCommands';
import { mergeSettings, normalizeSettings } from '../ui/settingsModel';

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];
const allProviders: AIProvider[] = [...providers, 'claude-code'];

function state(provider: AIProvider, webview: ProviderState['webview'] = 'loaded'): ProviderState {
  return {
    provider,
    webview,
    dom: webview === 'loaded' ? 'ready' : 'unknown',
    login: webview === 'loaded' ? 'logged_in' : 'unknown',
    thinking: false,
    lastStatusAt: 1,
  };
}

function states(overrides: Partial<Record<AIProvider, ProviderState>> = {}): Record<AIProvider, ProviderState> {
  return Object.fromEntries(allProviders.map((provider) => [provider, overrides[provider] ?? state(provider)])) as Record<
    AIProvider,
    ProviderState
  >;
}

function rect(x = 10, y = 20, width = 500, height = 360): DOMRectReadOnly {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({}) };
}

function commandHost(): PresentationCommandHost {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
    setBounds: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('N5 webview presentation model', () => {
  it('defaults dock providers to side and claude-code to chip', () => {
    const presentation = defaultPresentation();

    expect(presentation).toEqual({ chatgpt: 'side', claude: 'side', gemini: 'side', grok: 'side', 'claude-code': 'chip' });
    expect(sideProviders(presentation, providers)).toEqual(providers);
    expect(chipProviders(presentation, allProviders)).toEqual(['claude-code']);
    expect(centerPresentationProvider(presentation)).toBeUndefined();
  });

  it('transitions side to chip and back through side or center', () => {
    let presentation = defaultPresentation();

    presentation = setProviderPresentation(presentation, 'chatgpt', 'chip');
    expect(chipProviders(presentation, allProviders)).toEqual(['chatgpt', 'claude-code']);
    expect(sideProviders(presentation, providers)).toEqual(['claude', 'gemini', 'grok']);

    presentation = setProviderPresentation(presentation, 'chatgpt', 'center');
    expect(chipProviders(presentation, allProviders)).toEqual(['claude-code']);
    expect(centerPresentationProvider(presentation)).toBe('chatgpt');

    presentation = setProviderPresentation(presentation, 'chatgpt', 'side');
    expect(sideProviders(presentation, providers)).toEqual(providers);
    expect(centerPresentationProvider(presentation)).toBeUndefined();

    presentation = setProviderPresentation(presentation, 'claude-code', 'side');
    expect(sideProviders(presentation, allProviders)).toContain('claude-code');
    presentation = setProviderPresentation(presentation, 'claude-code', 'center');
    expect(centerPresentationProvider(presentation)).toBe('claude-code');
  });

  it('keeps only one provider in center and computes center-hidden side webviews', () => {
    let presentation = setProviderPresentation(defaultPresentation(), 'chatgpt', 'center');
    presentation = setProviderPresentation(presentation, 'claude', 'center');

    expect(presentation).toEqual({ chatgpt: 'side', claude: 'center', gemini: 'side', grok: 'side', 'claude-code': 'chip' });
    expect(centerHiddenProviders(presentation, states({ grok: state('grok', 'none') }), new Set<AIProvider>(['gemini']), providers)).toEqual([
      'chatgpt',
    ]);
  });

  it('normalizes settings and filters chip providers out of restore-open membership', () => {
    const normalized = normalizeSettings({
      openProviders: ['chatgpt', 'claude', 'gemini'],
      presentation: { chatgpt: 'chip', claude: 'center', gemini: 'bad', grok: 'side' },
    });

    expect(normalized.presentation).toEqual({ chatgpt: 'chip', claude: 'center', gemini: 'side', grok: 'side', 'claude-code': 'chip' });
    expect(restorableOpenProviders(normalized.openProviders, normalized.presentation)).toEqual(['claude', 'gemini']);

    const persisted = mergeSettings(normalized, {
      presentation: setProviderPresentation(normalized.presentation, 'gemini', 'chip'),
    });
    expect(persisted.presentation.gemini).toBe('chip');
  });

  it('normalizes invalid presentation entries to side instead of fallback state', () => {
    const fallback: ReturnType<typeof defaultPresentation> = {
      chatgpt: 'chip',
      claude: 'center',
      gemini: 'chip',
      grok: 'side',
      'claude-code': 'center',
    };

    expect(normalizePresentation({ chatgpt: 'bad', claude: 'side', gemini: 'bad', grok: 'bad', 'claude-code': 'bad' }, fallback)).toEqual({
      chatgpt: 'side',
      claude: 'side',
      gemini: 'side',
      grok: 'side',
      'claude-code': 'chip',
    });
  });

  it('hides side siblings only when the centered provider is loaded or promotion is in flight', () => {
    const presentation = setProviderPresentation(defaultPresentation(), 'claude', 'center');
    const centeredNotLoaded = states({ claude: state('claude', 'none') });

    expect(centerHiddenProviders(presentation, centeredNotLoaded, new Set(), providers)).toEqual([]);
    expect(centerHiddenProviders(presentation, centeredNotLoaded, new Set(), providers, new Set<AIProvider>(['claude']))).toEqual([
      'chatgpt',
      'gemini',
      'grok',
    ]);
    expect(centerHiddenProviders(presentation, states(), new Set(), providers)).toEqual(['chatgpt', 'gemini', 'grok']);
  });
});

describe('N5 webview presentation host commands', () => {
  it('hibernates to chip by closing the provider webview', async () => {
    const host = commandHost();

    await applyPresentationTransitionCommand({
      host,
      provider: 'chatgpt',
      state: 'chip',
      bounds: rect(),
      webview: 'loaded',
    });

    expect(host.close).toHaveBeenCalledWith('chatgpt');
    expect(host.open).not.toHaveBeenCalled();
  });

  it('promotes a hibernated chip to hidden side by opening then hiding the provider', async () => {
    const host = commandHost();
    const bounds = rect(24, 24, 420, 320);

    await applyPresentationTransitionCommand({
      host,
      provider: 'claude',
      state: 'side',
      bounds,
      webview: 'none',
    });

    expect(host.open).toHaveBeenCalledWith('claude', bounds);
    expect(host.hide).toHaveBeenCalledWith('claude');
    expect(host.close).not.toHaveBeenCalled();
    expect(host.show).not.toHaveBeenCalled();
    expect(host.setBounds).not.toHaveBeenCalled();
  });

  it('keeps a loaded side provider hidden without setting strip bounds', async () => {
    const host = commandHost();
    const bounds = rect(30, 40, 300, 200);

    await applyPresentationTransitionCommand({
      host,
      provider: 'gemini',
      state: 'side',
      bounds,
      webview: 'loaded',
    });

    expect(host.hide).toHaveBeenCalledWith('gemini');
    expect(host.show).not.toHaveBeenCalled();
    expect(host.setBounds).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
  });

  it('skips loaded side hide when the transition is stale at command time', async () => {
    const host = commandHost();
    const shouldContinue = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);

    await applyPresentationTransitionCommand({
      host,
      provider: 'gemini',
      state: 'side',
      bounds: rect(30, 40, 300, 200),
      webview: 'loaded',
      shouldContinue,
    });

    expect(host.hide).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
  });

  it('skips cold side hide when the transition becomes stale after open resolves', async () => {
    const host = commandHost();
    const bounds = rect(24, 24, 420, 320);
    let stillWanted = true;
    const shouldContinue = vi.fn(() => stillWanted);
    host.open = vi.fn(async () => {
      stillWanted = false;
    });

    await applyPresentationTransitionCommand({
      host,
      provider: 'claude',
      state: 'side',
      bounds,
      webview: 'none',
      shouldContinue,
    });

    expect(host.open).toHaveBeenCalledWith('claude', bounds);
    expect(host.hide).not.toHaveBeenCalled();
  });

  it('centers a loaded provider with center bounds and hides overlapping siblings', async () => {
    const host = commandHost();
    const bounds = rect(80, 90, 900, 520);

    await applyPresentationTransitionCommand({
      host,
      provider: 'gemini',
      state: 'center',
      bounds,
      webview: 'loaded',
    });
    await applyCenterStageCommand({
      host,
      provider: 'gemini',
      bounds,
      overlappingProviders: ['chatgpt', 'grok'],
    });

    expect(host.show).toHaveBeenCalledWith('gemini');
    expect(host.setBounds).toHaveBeenCalledWith('gemini', bounds);
    expect(host.hide).toHaveBeenCalledWith('chatgpt');
    expect(host.hide).toHaveBeenCalledWith('grok');
  });

  it('drops stale center commands after a newer center to chip transition runs', async () => {
    const host = commandHost();
    const frame = deferred();
    let presentation = defaultPresentation();
    let generation = 0;
    let webview: ProviderState['webview'] = 'loaded';
    const mountedBounds: { current?: DOMRectReadOnly } = {};

    const centerGeneration = ++generation;
    presentation = setProviderPresentation(presentation, 'chatgpt', 'center');
    const centerTransition = (async () => {
      const bounds = await waitForPresentationTargetBounds({
        getBounds: () => mountedBounds.current,
        waitFrame: () => frame.promise,
        shouldContinue: () => generation === centerGeneration && presentation.chatgpt === 'center',
      });
      if (!bounds) return;
      await applyPresentationTransitionCommand({
        host,
        provider: 'chatgpt',
        state: 'center',
        bounds,
        webview,
        currentWebview: () => webview,
        shouldContinue: () => generation === centerGeneration && presentation.chatgpt === 'center',
      });
    })();
    await Promise.resolve();

    const chipGeneration = ++generation;
    presentation = setProviderPresentation(presentation, 'chatgpt', 'chip');
    await applyPresentationTransitionCommand({
      host,
      provider: 'chatgpt',
      state: 'chip',
      bounds: rect(0, 0, 0, 0),
      webview,
      currentWebview: () => webview,
      shouldContinue: () => generation === chipGeneration && presentation.chatgpt === 'chip',
    });
    webview = 'none';

    mountedBounds.current = rect(80, 90, 900, 520);
    frame.resolve();
    await centerTransition;

    expect(presentation.chatgpt).toBe('chip');
    expect(webview).toBe('none');
    expect(host.close).toHaveBeenCalledWith('chatgpt');
    expect(host.open).not.toHaveBeenCalled();
    expect(host.show).not.toHaveBeenCalled();
    expect(host.setBounds).not.toHaveBeenCalled();
  });

  it('drops stale center commands after a rapid chip to center to chip sequence', async () => {
    const host = commandHost();
    const frame = deferred();
    let presentation = setProviderPresentation(defaultPresentation(), 'claude', 'chip');
    let generation = 0;
    const webview: ProviderState['webview'] = 'none';
    const mountedBounds: { current?: DOMRectReadOnly } = {};

    const centerGeneration = ++generation;
    presentation = setProviderPresentation(presentation, 'claude', 'center');
    const centerTransition = (async () => {
      const bounds = await waitForPresentationTargetBounds({
        getBounds: () => mountedBounds.current,
        waitFrame: () => frame.promise,
        shouldContinue: () => generation === centerGeneration && presentation.claude === 'center',
      });
      if (!bounds) return;
      await applyPresentationTransitionCommand({
        host,
        provider: 'claude',
        state: 'center',
        bounds,
        webview,
        currentWebview: () => webview,
        shouldContinue: () => generation === centerGeneration && presentation.claude === 'center',
      });
    })();
    await Promise.resolve();

    const chipGeneration = ++generation;
    presentation = setProviderPresentation(presentation, 'claude', 'chip');
    await applyPresentationTransitionCommand({
      host,
      provider: 'claude',
      state: 'chip',
      bounds: rect(0, 0, 0, 0),
      webview,
      currentWebview: () => webview,
      shouldContinue: () => generation === chipGeneration && presentation.claude === 'chip',
    });

    mountedBounds.current = rect(80, 90, 900, 520);
    frame.resolve();
    await centerTransition;

    expect(presentation.claude).toBe('chip');
    expect(host.close).toHaveBeenCalledWith('claude');
    expect(host.open).not.toHaveBeenCalled();
    expect(host.show).not.toHaveBeenCalled();
    expect(host.setBounds).not.toHaveBeenCalled();
  });

  it('skips center-hidden restore show calls while overlay guard is open and restores on modal close', async () => {
    const host = commandHost();
    const overlayHost = {
      hide: async (provider: AIProvider) => {
        await host.hide(provider);
      },
      show: async (provider: AIProvider) => {
        await host.show(provider);
      },
    };
    const guard = new OverlayGuardCounter();
    const snapshot = states();
    const presentation = setProviderPresentation(defaultPresentation(), 'claude', 'center');
    const centerHidden = new Set<AIProvider>(['claude']);

    guard.open(['claude'], overlayHost);
    await applyCenterHiddenCommands({
      host,
      previousHidden: centerHidden,
      nextHidden: new Set(),
      snapshot: () => ({
        states: snapshot,
        presentation,
        userHidden: new Set(),
        overlayGuardOpen: true,
      }),
    });

    expect(host.show).not.toHaveBeenCalled();

    guard.reconcile(['claude'], overlayHost);
    expect(host.hide).toHaveBeenCalledWith('claude');

    guard.close(overlayHost);
    expect(host.show).toHaveBeenCalledWith('claude');
    expect(host.show).toHaveBeenCalledTimes(1);
  });

  it('waits for mounted presentation bounds and opens with the real rect instead of fallback bounds', async () => {
    const host = commandHost();
    const fallback = rect(24, 24, 420, 320);
    const realBounds = rect(120, 130, 760, 440);
    let mountedBounds: DOMRectReadOnly | undefined;
    let frameCount = 0;

    const bounds = await waitForPresentationTargetBounds({
      getBounds: () => mountedBounds,
      waitFrame: async () => {
        frameCount += 1;
        mountedBounds = realBounds;
      },
    });

    await applyPresentationTransitionCommand({
      host,
      provider: 'grok',
      state: 'center',
      bounds: bounds ?? fallback,
      webview: 'none',
    });

    expect(frameCount).toBe(1);
    expect(host.open).toHaveBeenCalledWith('grok', realBounds);
    expect(host.open).not.toHaveBeenCalledWith('grok', fallback);
  });
});
