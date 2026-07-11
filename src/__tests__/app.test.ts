import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { bubbleAuthorLabel } from '../bubbleAuthorLabel';
import App, { ChatArea, presentationHiddenProvidersForCenterSurface } from '../App';
import { I18nProvider } from '../i18n/context';
import { applyCenterHiddenCommands } from '../ui/presentationCommands';
import { defaultPresentation, setProviderPresentation } from '../ui/presentation';

function state(provider: AIProvider, thinking = false): ProviderState {
  return {
    provider,
    webview: 'loaded',
    dom: 'ready',
    login: 'logged_in',
    thinking,
    lastStatusAt: 1,
  };
}

function states(overrides: Partial<Record<AIProvider, ProviderState>> = {}): Record<AIProvider, ProviderState> {
  return Object.fromEntries(
    (Object.keys(AI_PROVIDERS) as AIProvider[]).map((provider) => [provider, overrides[provider] ?? state(provider)]),
  ) as Record<AIProvider, ProviderState>;
}

describe('App bubble author labels', () => {
  it('is total for users, catalog providers, system, unknown, and missing providers', () => {
    expect(bubbleAuthorLabel({ role: 'user' })).toBe('You');

    for (const provider of Object.keys(AI_PROVIDERS) as AIProvider[]) {
      expect(bubbleAuthorLabel({ role: 'ai', provider })).toBe(AI_PROVIDERS[provider].name);
    }

    expect(() => bubbleAuthorLabel({ role: 'ai', provider: 'system' })).not.toThrow();
    expect(() => bubbleAuthorLabel({ role: 'ai', provider: 'unknown-provider' })).not.toThrow();
    expect(() => bubbleAuthorLabel({ role: 'ai' })).not.toThrow();
    expect(bubbleAuthorLabel({ role: 'ai', provider: 'system' })).toBe('System');
    expect(bubbleAuthorLabel({ role: 'ai', provider: 'unknown-provider' })).toBe('System');
    expect(bubbleAuthorLabel({ role: 'ai' })).toBe('System');
  });
});

describe('App workflow controls', () => {
  it('does not expose the legacy ask-before-each-step toggle', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, { language: 'en', children: createElement(App) }));

    expect(html).not.toContain('Ask me before each step');
    expect(html).not.toContain('每步先問我再送出');
  });

  it('places workflow controls in the left shelf before provider connections', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, { language: 'en', children: createElement(App) }));

    expect(html).toContain('id="workflow-control-shelf"');
    expect(html.indexOf('id="workflow-control-shelf"')).toBeLessThan(html.indexOf('id="provider-connections-title"'));
  });

  it('includes the optional AI-Sister commemorative surface without changing the default app structure', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, { language: 'en', children: createElement(App) }));

    expect(html).toContain('ai-sister-ensemble-card');
    expect(html).toContain('AI-Sister Commemorative Edition');
    expect(html).toContain('app-shell');
  });
});

describe('ChatArea thinking indicator', () => {
  it('hides streamed partial content while a non-final provider bubble is thinking', () => {
    const html = renderToStaticMarkup(
      createElement(ChatArea, {
        locale: 'en',
        states: states({ chatgpt: state('chatgpt', true) }),
        messages: [{ id: 'ai-chatgpt-1', role: 'ai', provider: 'chatgpt', content: 'provider reasoning scrape', final: false }],
      }),
    );

    expect(html).toContain('Thinking…');
    expect(html).toContain('data-provider="chatgpt"');
    expect(html).toContain('data-active="true"');
    expect(html).not.toContain('provider reasoning scrape');
    expect(html).not.toContain('streaming');
  });

  it('renders content for non-thinking and finalized bubbles', () => {
    const html = renderToStaticMarkup(
      createElement(ChatArea, {
        locale: 'en',
        states: states({ chatgpt: state('chatgpt', true), claude: state('claude', false) }),
        messages: [
          { id: 'ai-chatgpt-1', role: 'ai', provider: 'chatgpt', content: 'final answer', final: true },
          { id: 'ai-claude-1', role: 'ai', provider: 'claude', content: 'streaming answer', final: false },
          { id: 'ai-system-1', role: 'ai', provider: 'system', content: 'system content', final: false },
        ],
      }),
    );

    expect(html).toContain('final answer');
    expect(html).toContain('streaming answer');
    expect(html).toContain('system content');
    expect(html).toContain('streaming');
    expect(html).not.toContain('Thinking…');
  });
});

describe('text center presentation hidden set', () => {
  it('keeps a provider hidden after demoting it from text center to side', async () => {
    const providers = Object.keys(AI_PROVIDERS) as AIProvider[];
    const snapshot = states();
    const userHidden = new Set<AIProvider>();
    const host = {
      hide: vi.fn().mockResolvedValue(undefined),
      show: vi.fn().mockResolvedValue(undefined),
    };
    const previousPresentation = setProviderPresentation(defaultPresentation(), 'chatgpt', 'center');
    const nextPresentation = setProviderPresentation(previousPresentation, 'claude', 'center');

    const previousHidden = presentationHiddenProvidersForCenterSurface({
      centerSurface: 'text',
      presentation: previousPresentation,
      states: snapshot,
      userHidden,
      providers,
    });
    const nextHidden = presentationHiddenProvidersForCenterSurface({
      centerSurface: 'text',
      presentation: nextPresentation,
      states: snapshot,
      userHidden,
      providers,
    });

    expect(previousHidden.has('chatgpt')).toBe(true);
    expect(nextHidden.has('chatgpt')).toBe(false);
    expect(nextHidden.has('claude')).toBe(true);

    await applyCenterHiddenCommands({
      host,
      previousHidden,
      nextHidden,
      snapshot: () => ({
        states: snapshot,
        presentation: nextPresentation,
        userHidden,
        overlayGuardOpen: false,
      }),
    });

    expect(host.show).not.toHaveBeenCalled();
    expect(host.hide).toHaveBeenCalledWith('claude');
  });
});
