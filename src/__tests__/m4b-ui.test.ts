import { describe, expect, it, vi } from 'vitest';
import type { AIProvider, ProviderState } from '../../shared/types';
import { dragColumnWidth, gridTemplateColumns } from '../ui/dockLayout';
import { DEFAULT_FOCUS_PANE_WIDTH } from '../ui/focusLayout';
import { OverlayGuardCounter } from '../ui/overlayGuard';
import { defaultPresentation } from '../ui/presentation';
import { defaultSettings, mergeSettings, normalizeSettings } from '../ui/settingsModel';
import { DEFAULT_SLOT_ASSIGNMENT, SLOT_IDS, assignSlotProvider, isProviderPermutation, normalizeSlotAssignment } from '../ui/slotAssignment';
import { visibleLoadedProviders } from '../ui/visibility';

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

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
  return Object.fromEntries(providers.map((provider) => [provider, overrides[provider] ?? state(provider)])) as Record<
    AIProvider,
    ProviderState
  >;
}

describe('M4b UI helpers', () => {
  it('clamps dragged dock widths and emits a grid-template string', () => {
    expect(dragColumnWidth(280, -500, 200, 520)).toBe(200);
    expect(dragColumnWidth(280, 500, 200, 520)).toBe(520);
    expect(dragColumnWidth(280, 25, 200, 520)).toBe(305);
    expect(gridTemplateColumns({ left: 260, right: 340 })).toBe('260px 6px minmax(360px, 1fr) 6px 340px');
  });

  it('swaps slot providers and preserves the four-provider permutation', () => {
    expect(DEFAULT_SLOT_ASSIGNMENT).toEqual({
      leftTop: 'chatgpt',
      leftBottom: 'claude',
      rightTop: 'gemini',
      rightBottom: 'grok',
    });

    const assigned = assignSlotProvider(DEFAULT_SLOT_ASSIGNMENT, 'leftTop', 'grok');
    expect(assigned).toEqual({
      leftTop: 'grok',
      leftBottom: 'claude',
      rightTop: 'gemini',
      rightBottom: 'chatgpt',
    });
    expect(isProviderPermutation(SLOT_IDS.map((slot) => assigned[slot]))).toBe(true);
    expect(isProviderPermutation(['chatgpt', 'claude', 'gemini', 'gemini'])).toBe(false);
    expect(
      normalizeSlotAssignment({
        leftTop: 'removed-provider',
        leftBottom: 'chatgpt',
        rightTop: 'claude',
        rightBottom: 'gemini',
      }),
    ).toEqual({
      leftTop: 'grok',
      leftBottom: 'chatgpt',
      rightTop: 'claude',
      rightBottom: 'gemini',
    });
  });

  it('filters visible loaded providers by webview state and user-hidden set', () => {
    expect(
      visibleLoadedProviders(
        states({
          claude: state('claude', 'none'),
        }),
        new Set<AIProvider>(['gemini']),
        providers,
      ),
    ).toEqual(['chatgpt', 'grok']);
  });

  it('normalizes and merges settings defensively', () => {
    const legacyPublishTokenKey = ['hack', 'mdToken'].join('');

    expect(defaultSettings()).toMatchObject({
      language: 'system',
      theme: 'light',
      layoutMode: 'focus',
      focusPaneWidth: DEFAULT_FOCUS_PANE_WIDTH,
      columnWidths: { left: 280, right: 280 },
      slotAssignment: DEFAULT_SLOT_ASSIGNMENT,
      openProviders: [],
      telemetry: 'none',
      snapshotPersistence: false,
      snapshotRedactionTier: 'metadata-only',
      presentation: defaultPresentation(),
    });

    const normalized = normalizeSettings({
      [legacyPublishTokenKey]: 123,
      columnWidths: { left: 10, right: 900 },
      slotAssignment: { leftTop: 'chatgpt', leftBottom: 'chatgpt' },
      openProviders: ['grok', 'nope', 'grok', 'removed-provider'],
      portable: true,
      snapshotPersistence: true,
      snapshotRedactionTier: 'unknown',
      language: 'fr',
      theme: 'dark',
      presentation: { chatgpt: 'chip', claude: 'center', gemini: 'bad', grok: 'center' },
    });
    expect(normalized.language).toBe('system');
    expect(normalized.theme).toBe('dark');
    expect(normalized.layoutMode).toBe('focus');
    expect(normalized.focusPaneWidth).toBe(420);
    expect(Object.prototype.hasOwnProperty.call(normalized, legacyPublishTokenKey)).toBe(false);
    expect(normalized.columnWidths.left).toBeGreaterThanOrEqual(200);
    expect(normalized.columnWidths.right).toBeLessThanOrEqual(520);
    expect(isProviderPermutation(SLOT_IDS.map((slot) => normalized.slotAssignment[slot]))).toBe(true);
    expect(normalized.openProviders).toEqual(['grok']);
    expect(normalized.portable).toBe(true);
    expect(normalized.snapshotPersistence).toBe(true);
    expect(normalized.snapshotRedactionTier).toBe('metadata-only');
    expect(normalized.presentation).toEqual({ chatgpt: 'chip', claude: 'center', gemini: 'side', grok: 'side' });

    expect(mergeSettings(normalized, { snapshotRedactionTier: 'hashes', language: 'zh-TW' })).toMatchObject({
      layoutMode: 'focus',
      focusPaneWidth: 420,
      language: 'zh-TW',
      openProviders: ['grok'],
      portable: true,
      snapshotRedactionTier: 'hashes',
    });

    expect(normalizeSettings({}).theme).toBe('light');
    expect(normalizeSettings({ theme: 'system' }).theme).toBe('light');
    expect(normalizeSettings({ theme: 'dark' }).theme).toBe('dark');
  });

  it('migrates focus pane width from the legacy left column width', () => {
    expect(normalizeSettings({ columnWidths: { left: 500, right: 320 } })).toMatchObject({
      layoutMode: 'focus',
      focusPaneWidth: 500,
      columnWidths: { left: 500, right: 320 },
    });
  });

  it('uses visibleLoadedProviders with the overlay guard to leave user-hidden panes untouched', () => {
    const guard = new OverlayGuardCounter();
    const hide = vi.fn();
    const show = vi.fn();
    const host = { hide, show };
    const hidden = new Set<AIProvider>(['claude']);
    const snapshot = states();

    guard.open(visibleLoadedProviders(snapshot, hidden, providers), host);
    expect(hide.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'gemini', 'grok']);

    hidden.delete('claude');
    guard.reconcile(visibleLoadedProviders(snapshot, hidden, providers), host);
    expect(hide.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'gemini', 'grok', 'claude']);

    guard.close(host);
    expect(show.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'gemini', 'grok', 'claude']);
  });

  it('does not restore a provider that becomes user-hidden while a modal is open', () => {
    const guard = new OverlayGuardCounter();
    const hide = vi.fn();
    const show = vi.fn();
    const host = { hide, show };
    const hidden = new Set<AIProvider>();
    const snapshot = states();

    guard.open(visibleLoadedProviders(snapshot, hidden, providers), host);
    hidden.add('gemini');
    guard.reconcile(visibleLoadedProviders(snapshot, hidden, providers), host);
    guard.close(host);

    expect(show.mock.calls.map(([provider]) => provider)).toEqual(['chatgpt', 'claude', 'grok']);
  });
});
