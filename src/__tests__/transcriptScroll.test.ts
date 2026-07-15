import { describe, expect, it, vi } from 'vitest';
import { isTranscriptNearEnd, scrollTranscriptToEnd } from '../ui/transcriptScroll';

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
});
