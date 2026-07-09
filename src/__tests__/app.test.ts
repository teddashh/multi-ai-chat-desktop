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
import { ChatArea } from '../App';

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
