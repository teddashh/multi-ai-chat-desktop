import { describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { bubbleAuthorLabel } from '../bubbleAuthorLabel';

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
