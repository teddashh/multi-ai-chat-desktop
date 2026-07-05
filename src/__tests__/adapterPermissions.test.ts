import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../../shared/types';
import { buildAdapterPermissionSummary } from '../ui/adapterPermissions';

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

describe('adapter permission summaries', () => {
  it('always includes the fixed architectural cannot list', () => {
    for (const provider of providers) {
      const summary = buildAdapterPermissionSummary(provider);
      const text = summary.cannot.map((line) => `${line.title} ${line.detail}`).join('\n');

      expect(text).toContain('cookies');
      expect(text).toContain('password');
      expect(text).toContain('localStorage');
      expect(text).toContain('Other tabs');
      expect(text).toContain('desktop app');
      expect(text).toContain('other than the AI provider site');
      expect(text).toContain('There is no separate or hidden third-party relay');
      expect(text).toContain('broken-adapter report');
    }
  });

  it('uses the fixed generic envelope when selector details are not available', () => {
    const summary = buildAdapterPermissionSummary('claude');

    expect(summary.provider).toBe('claude');
    expect(summary.providerName).toBe('Claude');
    expect(summary.selectorDetailsAvailable).toBe(false);
    expect(summary.note).toContain('not exposed');
    expect(summary.reads.map((line) => line.detail)).toEqual([
      "Reads text from the page elements this adapter's response selectors match (intended: the assistant's reply).",
      'Runs presence / text-match checks on adapter-defined login, logged-out, and thinking selectors so the control pane can show ready, logged out, blocked, or streaming status.',
      'Reads the composer text after insertion to verify/retry that your prompt was entered.',
      'Reads broken-adapter diagnostics only when YOU click Report: which selectors match/miss, allowlisted element attributes, and text LENGTHS - never the page/message text itself.',
    ]);
    expect(summary.writes.map((line) => line.detail)).toEqual([
      "Types your prompt into Claude's composer element identified by the adapter.",
      "Clicks Claude's Send control identified by the adapter.",
      'Dispatches Enter to the composer when the send button is missing/disabled or the adapter uses the enter send-strategy.',
      'Clicks the adapter-defined stop button to cancel an in-flight run.',
    ]);
    expect(summary.reads.some((line) => line.selectors)).toBe(false);
    expect(summary.writes.some((line) => line.selectors)).toBe(false);
  });

  it('reflects provider selector details when they are supplied', () => {
    const summary = buildAdapterPermissionSummary('grok', {
      responseSelectors: ['[data-testid="assistant-message"]', '[data-testid="assistant-message"]'],
      loginDetectors: ['[data-testid="chat-submit"]'],
      loggedOutDetectors: ['.login-wall'],
      thinkingDetectors: [{ selector: '.thinking-container', textIncludes: 'Thinking', textExcludes: 'Thought for' }],
      inputSelectors: ['[data-testid="chat-input"] .ProseMirror[contenteditable="true"]'],
      sendButtonSelectors: ['button[data-testid="chat-submit"]'],
      stopButtonSelectors: ['button[aria-label="Stop"]'],
    });

    expect(summary.providerName).toBe('Grok');
    expect(summary.selectorDetailsAvailable).toBe(true);
    expect(summary.note).toBeUndefined();
    expect(summary.reads[0]).toMatchObject({
      title: "The AI's reply text",
      selectors: ['[data-testid="assistant-message"]'],
    });
    expect(summary.reads[1].selectors).toEqual([
      '[data-testid="chat-submit"]',
      '.login-wall',
      '.thinking-container (text includes "Thinking"; text excludes "Thought for")',
    ]);
    expect(summary.reads[2]).toMatchObject({
      title: 'The composer text after insertion',
      selectors: ['[data-testid="chat-input"] .ProseMirror[contenteditable="true"]'],
    });
    expect(summary.reads[3].title).toBe('Broken-adapter diagnostics');
    expect(summary.writes[0].selectors).toEqual(['[data-testid="chat-input"] .ProseMirror[contenteditable="true"]']);
    expect(summary.writes[1].selectors).toEqual(['button[data-testid="chat-submit"]']);
    expect(summary.writes[2].selectors).toEqual(['[data-testid="chat-input"] .ProseMirror[contenteditable="true"]']);
    expect(summary.writes[3]).toMatchObject({
      title: 'Stop control (only when YOU cancel)',
      selectors: ['button[aria-label="Stop"]'],
    });
  });
});
