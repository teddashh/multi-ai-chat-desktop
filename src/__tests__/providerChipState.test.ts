import { describe, expect, it } from 'vitest';
import type { ProviderState } from '../../shared/types';
import { t } from '../i18n/t';
import { chipState, isStuckProvider } from '../ui/providerChipState';

function state(overrides: Partial<ProviderState> = {}): ProviderState {
  return {
    provider: 'chatgpt',
    webview: 'none',
    dom: 'unknown',
    login: 'unknown',
    thinking: false,
    lastStatusAt: 0,
    bridge: 'ok',
    adapter: 'ok',
    ...overrides,
  };
}

const translate = (key: Parameters<typeof t>[0]) => t(key, 'en');

describe('provider chip state', () => {
  it('never labels an unopened collapsed provider as session-ready', () => {
    expect(chipState(state(), 'chip', translate).label).toBe('Open');
  });

  it('distinguishes an opening provider from one that is not open', () => {
    expect(chipState(state({ webview: 'creating' }), 'side', translate).label).toBe('Opening…');
  });

  it('shows actionable health before the background presentation label', () => {
    expect(
      chipState(state({ webview: 'loaded', dom: 'ready', login: 'logged_out' }), 'chip', translate).label,
    ).toBe('Sign in');
    expect(
      chipState(state({ webview: 'loaded', dom: 'ready', login: 'logged_in' }), 'chip', translate).label,
    ).toBe('Ready in background');
  });
});

// Clicking a card that reports stuck recreates Grok's webview. Each exclusion below is a case where
// that would destroy something the user still wants or mask a different failure.
describe('stuck provider detection', () => {
  it('reports a loaded provider whose bridge never came up', () => {
    // Grok after a navigation that produced no document-title event: loaded, signed in, no dom.
    expect(
      isStuckProvider(
        state({ provider: 'grok', webview: 'loaded', dom: 'unknown', login: 'logged_in', lastStatusAt: 10_000 }),
        50_001,
      ),
    ).toBe(true);
  });

  it('includes Grok with unknown login because the missing bridge cannot report login state', () => {
    expect(
      isStuckProvider(
        state({ provider: 'grok', webview: 'loaded', dom: 'unknown', login: 'unknown', lastStatusAt: 10_000 }),
        50_001,
      ),
    ).toBe(true);
  });

  it('spares a newly loaded signed-in provider while its bridge is still starting', () => {
    expect(
      isStuckProvider(
        state({ provider: 'grok', webview: 'loaded', dom: 'unknown', login: 'logged_in', lastStatusAt: 10_000 }),
        50_000,
      ),
    ).toBe(false);
  });

  it('spares blocked and logged-out sessions so challenge and login handling stay passive', () => {
    expect(
      isStuckProvider(
        state({ provider: 'grok', webview: 'loaded', dom: 'unknown', login: 'blocked', lastStatusAt: 10_000 }),
        50_001,
      ),
    ).toBe(false);
    expect(
      isStuckProvider(
        state({ provider: 'grok', webview: 'loaded', dom: 'unknown', login: 'logged_out', lastStatusAt: 10_000 }),
        50_001,
      ),
    ).toBe(false);
  });

  it('spares a provider that is answering, so a reload cannot cut off a reply in flight', () => {
    expect(
      isStuckProvider(
        state({ provider: 'grok', webview: 'loaded', dom: 'unknown', login: 'logged_in', thinking: true, lastStatusAt: 10_000 }),
        50_001,
      ),
    ).toBe(false);
  });

  it('requires explicitly healthy host metadata before offering recovery', () => {
    const stale = { provider: 'grok' as const, webview: 'loaded' as const, dom: 'unknown' as const, login: 'unknown' as const, lastStatusAt: 10_000 };
    expect(isStuckProvider(state({ ...stale, adapter: 'broken' }), 50_001)).toBe(false);
    expect(isStuckProvider(state({ ...stale, bridge: 'degraded' }), 50_001)).toBe(false);
    expect(isStuckProvider(state({ ...stale, adapter: undefined }), 50_001)).toBe(false);
    expect(isStuckProvider(state({ ...stale, bridge: undefined }), 50_001)).toBe(false);
  });

  it('spares a healthy provider and one with no webview at all', () => {
    expect(
      isStuckProvider(
        state({ provider: 'grok', webview: 'loaded', dom: 'ready', login: 'logged_in', lastStatusAt: 10_000 }),
        50_001,
      ),
    ).toBe(false);
    expect(isStuckProvider(state({ provider: 'grok', webview: 'none' }), 50_001)).toBe(false);
    expect(isStuckProvider(state({ provider: 'grok', webview: 'creating' }), 50_001)).toBe(false);
  });

  it('does not apply the Grok lifecycle recovery to other providers', () => {
    expect(
      isStuckProvider(
        state({ provider: 'chatgpt', webview: 'loaded', dom: 'unknown', login: 'logged_in', lastStatusAt: 10_000 }),
        50_001,
      ),
    ).toBe(false);
  });
});
