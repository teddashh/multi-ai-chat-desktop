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

export interface TranscriptProviderBubble {
  scrollIntoView(options?: ScrollIntoViewOptions): void;
  classList: { add(token: string): void; remove(token: string): void };
}

export interface TranscriptProviderLookup {
  querySelectorAll(selector: string): ArrayLike<TranscriptProviderBubble>;
}

/** 捲到該 provider 最後一則訊息並短暫高亮；沒參與對話則不動。回傳是否有捲動。
 * 限定 article：訊息內的頭像 span 也帶 data-provider，且在預設主題是 display:none，
 * 對隱藏元素呼叫 scrollIntoView 不會捲動。 */
export function scrollTranscriptToProviderMessage(container: TranscriptProviderLookup, provider: string): boolean {
  const bubbles = container.querySelectorAll(`article[data-provider="${provider}"]`);
  const last = bubbles[bubbles.length - 1];
  if (!last) return false;
  last.scrollIntoView({ block: 'start' });
  last.classList.add(HIGHLIGHT_CLASS);
  setTimeout(() => last.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION_MS);
  return true;
}
