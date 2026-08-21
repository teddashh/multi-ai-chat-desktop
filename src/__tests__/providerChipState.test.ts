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

// Clicking a card that reports stuck reloads the provider, which throws away whatever the page was
// showing. Each exclusion below is a case where that would destroy something the user still wants.
describe('stuck provider detection', () => {
  it('reports a loaded provider whose bridge never came up', () => {
    // Grok after a navigation that produced no document-title event: loaded, signed in, no dom.
    expect(isStuckProvider(state({ webview: 'loaded', dom: 'unknown', login: 'logged_in' }))).toBe(true);
  });

  it('spares blocked and unknown sessions so challenge and status handling stay passive', () => {
    expect(isStuckProvider(state({ webview: 'loaded', dom: 'unknown', login: 'blocked' }))).toBe(false);
    expect(isStuckProvider(state({ webview: 'loaded', dom: 'unknown', login: 'unknown' }))).toBe(false);
  });

  it('spares a provider that is answering, so a reload cannot cut off a reply in flight', () => {
    expect(
      isStuckProvider(state({ webview: 'loaded', dom: 'unknown', login: 'logged_in', thinking: true })),
    ).toBe(false);
  });

  it('spares a logged-out provider, whose sign-in page a reload would discard', () => {
    expect(isStuckProvider(state({ webview: 'loaded', dom: 'unknown', login: 'logged_out' }))).toBe(false);
  });

  it('spares a healthy provider and one with no webview at all', () => {
    expect(isStuckProvider(state({ webview: 'loaded', dom: 'ready', login: 'logged_in' }))).toBe(false);
    expect(isStuckProvider(state({ webview: 'none' }))).toBe(false);
    expect(isStuckProvider(state({ webview: 'creating' }))).toBe(false);
  });
});
