import { describe, expect, it } from 'vitest';
import type { ProviderState } from '../../shared/types';
import { t } from '../i18n/t';
import { chipState } from '../ui/providerChipState';

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
