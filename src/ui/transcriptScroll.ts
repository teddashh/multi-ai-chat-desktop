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
