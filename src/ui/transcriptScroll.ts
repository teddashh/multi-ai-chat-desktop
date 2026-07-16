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
