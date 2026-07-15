import { describe, expect, it, vi } from 'vitest';
import { isTranscriptNearEnd, scrollTranscriptToEnd, scrollTranscriptToProviderMessage } from '../ui/transcriptScroll';

describe('transcript scrolling', () => {
  it('distinguishes reading older content from following the latest response', () => {
    expect(isTranscriptNearEnd({ scrollHeight: 1_000, scrollTop: 804, clientHeight: 100 })).toBe(true);
    expect(isTranscriptNearEnd({ scrollHeight: 1_000, scrollTop: 500, clientHeight: 100 })).toBe(false);
  });

  it('scrolls only the transcript container to its own end', () => {
    const scrollTo = vi.fn();
    scrollTranscriptToEnd({ scrollHeight: 2_400, scrollTop: 200, clientHeight: 600, scrollTo });

    expect(scrollTo).toHaveBeenCalledWith({ top: 2_400, behavior: 'auto' });
  });

  const fakeBubble = () => ({
    scrollIntoView: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn() },
  });

  it('jumps to the latest message of the clicked provider so the user sees its part of the conversation', () => {
    const older = fakeBubble();
    const latest = fakeBubble();
    const container = {
      querySelectorAll: vi.fn((selector: string) => (selector === 'article[data-provider="chatgpt"]' ? [older, latest] : [])),
    };

    expect(scrollTranscriptToProviderMessage(container, 'chatgpt')).toBe(true);
    expect(older.scrollIntoView).not.toHaveBeenCalled();
    expect(latest.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('flashes a temporary highlight on the target message so the user can spot it', () => {
    vi.useFakeTimers();
    try {
      const bubble = fakeBubble();
      const container = { querySelectorAll: () => [bubble] };

      scrollTranscriptToProviderMessage(container, 'chatgpt');

      expect(bubble.classList.add).toHaveBeenCalledWith('transcript-provider-highlight');
      expect(bubble.classList.remove).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(bubble.classList.remove).toHaveBeenCalledWith('transcript-provider-highlight');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the transcript alone when the provider never joined the conversation', () => {
    const container = { querySelectorAll: () => [] };

    expect(scrollTranscriptToProviderMessage(container, 'gemini')).toBe(false);
  });
});
