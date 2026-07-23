import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';

export interface TranscriptScrollContainer {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  scrollTo(options: ScrollToOptions): void;
}

export function isTranscriptNearEnd(container: Pick<TranscriptScrollContainer, 'scrollHeight' | 'scrollTop' | 'clientHeight'>, threshold = 96): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

export function scrollTranscriptToEnd(container: TranscriptScrollContainer, behavior: ScrollBehavior = 'auto'): void {
  container.scrollTo({ top: container.scrollHeight, behavior });
}

const HIGHLIGHT_CLASS = 'transcript-provider-highlight';
const HIGHLIGHT_DURATION_MS = 1_600;
const highlightTimers = new WeakMap<TranscriptProviderBubble, ReturnType<typeof setTimeout>>();

export interface TranscriptProviderBubble {
  scrollIntoView(options?: ScrollIntoViewOptions): void;
  classList: { add(token: string): void; remove(token: string): void };
}

export interface TranscriptProviderLookup {
  querySelectorAll(selector: string): ArrayLike<TranscriptProviderBubble>;
}

export interface TranscriptSpyBubble {
  getBoundingClientRect(): { top: number };
  getAttribute(name: string): string | null;
}

export interface TranscriptSpyContainer {
  querySelectorAll(selector: string): ArrayLike<TranscriptSpyBubble>;
  getBoundingClientRect(): { top: number };
}

// 找出目前捲動到「閱讀線」（容器頂端往下一小段）之上、最後一則訊息的 provider，
// 用來讓左側 chip 跟著使用者正在讀的內容換人反白，而不必真的切換 center stage。
export function findScrollActiveProvider(container: TranscriptSpyContainer, readingLineOffset = 24): AIProvider | undefined {
  const bubbles = container.querySelectorAll('article[data-provider]');
  if (bubbles.length === 0) return undefined;
  const readingLine = container.getBoundingClientRect().top + readingLineOffset;

  let low = 0;
  let high = bubbles.length - 1;
  let activeIndex = -1;
  while (low <= high) {
    const index = Math.floor((low + high) / 2);
    if (bubbles[index].getBoundingClientRect().top <= readingLine) {
      activeIndex = index;
      low = index + 1;
    } else {
      high = index - 1;
    }
  }

  if (activeIndex < 0) return undefined;
  const provider = bubbles[activeIndex].getAttribute('data-provider');
  return isAIProvider(provider) ? provider : undefined;
}

function isAIProvider(value: string | null): value is AIProvider {
  return typeof value === 'string' && value in AI_PROVIDERS;
}

export function scrollTranscriptToProviderMessage(container: TranscriptProviderLookup, provider: AIProvider): boolean {
  const bubbles = container.querySelectorAll(`article[data-provider="${provider}"]`);
  const last = bubbles[bubbles.length - 1];
  if (!last) return false;
  last.scrollIntoView({ block: 'start' });
  last.classList.add(HIGHLIGHT_CLASS);
  const previousTimer = highlightTimers.get(last);
  if (previousTimer !== undefined) clearTimeout(previousTimer);
  const timer = setTimeout(() => {
    last.classList.remove(HIGHLIGHT_CLASS);
    highlightTimers.delete(last);
  }, HIGHLIGHT_DURATION_MS);
  highlightTimers.set(last, timer);
  return true;
}
