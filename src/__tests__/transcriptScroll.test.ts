import { afterEach, describe, expect, it, vi } from 'vitest';
import { findScrollActiveProvider, isTranscriptNearEnd, scrollTranscriptToEnd, scrollTranscriptToProviderMessage } from '../ui/transcriptScroll';

describe('transcript scrolling', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

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
    vi.useFakeTimers();
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
    const bubble = fakeBubble();
    const container = { querySelectorAll: () => [bubble] };

    scrollTranscriptToProviderMessage(container, 'chatgpt');

    expect(bubble.classList.add).toHaveBeenCalledWith('transcript-provider-highlight');
    expect(bubble.classList.remove).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(bubble.classList.remove).toHaveBeenCalledWith('transcript-provider-highlight');
  });

  it('restarts the full highlight duration when the same provider is clicked again', () => {
    vi.useFakeTimers();
    const bubble = fakeBubble();
    const container = { querySelectorAll: () => [bubble] };

    scrollTranscriptToProviderMessage(container, 'chatgpt');
    vi.advanceTimersByTime(1_000);
    scrollTranscriptToProviderMessage(container, 'chatgpt');
    vi.advanceTimersByTime(600);

    expect(bubble.classList.remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(bubble.classList.remove).toHaveBeenCalledTimes(1);
  });

  it('leaves the transcript alone when the provider never joined the conversation', () => {
    vi.useFakeTimers();
    const container = { querySelectorAll: () => [] };

    expect(scrollTranscriptToProviderMessage(container, 'gemini')).toBe(false);
  });

  const fakeArticle = (provider: string, top: number) => ({
    getBoundingClientRect: () => ({ top }),
    getAttribute: () => provider,
  });

  it('picks the message that has scrolled past the reading line so the chip matches what the user is reading', () => {
    const container = {
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => [fakeArticle('chatgpt', -200), fakeArticle('claude', -10), fakeArticle('gemini', 300)],
    };

    expect(findScrollActiveProvider(container)).toBe('claude');
  });

  it('falls back to the first message when nothing has reached the reading line yet', () => {
    const container = {
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => [fakeArticle('chatgpt', 50), fakeArticle('claude', 300)],
    };

    expect(findScrollActiveProvider(container)).toBe('chatgpt');
  });

  it('returns undefined when the transcript has no provider messages', () => {
    const container = { getBoundingClientRect: () => ({ top: 0 }), querySelectorAll: () => [] };

    expect(findScrollActiveProvider(container)).toBeUndefined();
  });
});
