import { OUTBOX_MAX_BYTES, PULL_MAX_DECODED_BYTES } from '../shared/constants';
import { hasCloudflareChallengeSignals, isCloudflareChallengeActive } from './challenge';
import { encodeTitleFrame } from './codec';
import type { BridgeMessage, MessageAction } from '../shared/types';

export { hasCloudflareChallengeSignals };

type BulkAction = MessageAction | 'ECHO_BULK';

interface TitleEmitOptions {
  immediate?: boolean;
}

export interface OutboxEntry extends BridgeMessage {
  mid: number;
}

interface OutboxLike {
  entries: OutboxEntry[];
  bytes: number;
  degraded: boolean;
  reason?: string;
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function capOutboxEntry(entry: OutboxEntry, maxBytes = PULL_MAX_DECODED_BYTES): OutboxEntry {
  let next = entry;
  let previousSize = Number.MAX_SAFE_INTEGER;
  while (byteLength(JSON.stringify(next)) > maxBytes - 2) {
    const currentSize = byteLength(JSON.stringify(next));
    if (currentSize >= previousSize) {
      next = { ...next, payload: next.action === 'RESPONSE_DONE' ? { truncated: true } : '' };
      break;
    }
    previousSize = currentSize;
    const payload = next.payload;
    if (typeof payload === 'string') {
      const text = payload.slice(0, Math.max(0, Math.floor(payload.length * 0.75)));
      next = { ...next, payload: next.action === 'RESPONSE_DONE' ? { text, truncated: true } : text };
    } else if (payload && typeof payload === 'object') {
      const copy = { ...(payload as Record<string, unknown>) };
      if (typeof copy.data === 'string') copy.data = copy.data.slice(0, Math.max(0, Math.floor(copy.data.length * 0.75)));
      else if (typeof copy.text === 'string') copy.text = copy.text.slice(0, Math.max(0, Math.floor(copy.text.length * 0.75)));
      else copy.truncated = true;
      if (next.action === 'RESPONSE_DONE') copy.truncated = true;
      next = { ...next, payload: copy };
    } else {
      next = { ...next, payload: next.action === 'RESPONSE_DONE' ? { truncated: true } : '' };
    }
  }
  if (next.action === 'RESPONSE_DONE' && next !== entry && next.payload && typeof next.payload === 'object') {
    return { ...next, payload: { ...(next.payload as Record<string, unknown>), truncated: true } };
  }
  return next;
}

export function peekOutboxBatch(entries: OutboxEntry[], maxBytes = PULL_MAX_DECODED_BYTES): OutboxEntry[] {
  const batch: OutboxEntry[] = [];
  let batchBytes = 2;
  for (const entry of entries) {
    const size = byteLength(JSON.stringify(entry));
    if (batchBytes + size > maxBytes) break;
    batch.push(entry);
    batchBytes += size + 1;
    if (batchBytes >= maxBytes) break;
  }
  return batch;
}

export function ackOutbox(entries: OutboxEntry[], maxMid: number): OutboxEntry[] {
  return entries.filter((entry) => entry.mid > maxMid);
}

export function enforceOutboxOverflow(box: OutboxLike, maxBytes = OUTBOX_MAX_BYTES): OutboxLike {
  const entries = [...box.entries];
  let bytes = box.bytes;
  let degraded = box.degraded;
  let reason = box.reason;
  while (bytes > maxBytes) {
    const index = entries.findIndex((entry) => entry.action === 'RESPONSE_CHUNK');
    if (index < 0) {
      degraded = true;
      reason = 'outbox_full_no_chunk';
      break;
    }
    const [removed] = entries.splice(index, 1);
    bytes -= byteLength(JSON.stringify(removed));
    degraded = true;
    reason = 'outbox_chunk_dropped';
  }
  return { entries, bytes, degraded, reason };
}

export function shouldDeferBridgeStart(
  _provider: string,
  readyState: DocumentReadyState,
  hasComposer: boolean,
  challengeActive: boolean,
): boolean {
  return challengeActive || (!hasComposer && readyState === 'loading');
}

export function shouldPatchHistory(provider: string): boolean {
  return provider !== 'grok';
}

interface MacBridge {
  version: 1;
  bootId: string;
  emit(message: unknown): void;
  dispatch(message: BridgeMessage): void;
  onDispatch(handler: (message: BridgeMessage) => void): void;
  emitTitle(action: MessageAction, payload?: unknown, options?: TitleEmitOptions): void;
  enqueueBulk(message: Omit<BridgeMessage, 'v' | 'provider' | 'bootId' | 'mid'> & { action: BulkAction }): OutboxEntry;
  peekOutbox(): OutboxEntry[];
  ackBulk(maxMid: number): void;
  sendBulk(action: BulkAction, payload?: unknown): Promise<void>;
}

(function bootstrap() {
  if (typeof window === 'undefined') return;
  if (window.self !== window.top) return;
  if (!/^https?:$/.test(location.protocol)) return;
  if (window.__MAC_BRIDGE__) return;

  const provider = providerFromLabel();
  const hasComposer = Boolean(
    document.querySelector('[data-testid="chat-input"] [contenteditable="true"], .ProseMirror[contenteditable="true"]'),
  );
  const challengeActive = isCloudflareChallengeActive();
  if (shouldDeferBridgeStart(provider, document.readyState, hasComposer, challengeActive)) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
      window.setTimeout(bootstrap, 500);
    }
    return;
  }

  const bootId = randomId();
  const queue: BridgeMessage[] = [];
  const outbox: OutboxEntry[] = [];
  let dispatchHandler: ((message: BridgeMessage) => void) | undefined;
  let seq = 0;
  let mid = 0;
  let outboxBytes = 0;
  let degraded = false;
  let degradedReason: string | undefined;
  let titleTimer: number | undefined;
  let hintTimer: number | undefined;
  let lastTitleEmitAt = 0;
  let latestTitle: { action: MessageAction; payload?: unknown } | undefined;
  let titleEmitChain = Promise.resolve();
  let inFlightTitleFrame: string | undefined;

  function logError(error: unknown) {
    console.error('[MAC bridge]', error);
  }

  function emitTitleNow(action: MessageAction, payload?: unknown): void {
    titleEmitChain = titleEmitChain
      .then(() => emitTitleFrame(action, payload))
      .catch((error: unknown) => {
        logError(error);
      });
  }

  async function emitTitleFrame(action: MessageAction, payload?: unknown): Promise<void> {
    const titlePayload =
      action === 'STATUS_REPORT' && outbox.length > 0
        ? { ...((payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>), bulkReady: outbox.length }
        : payload;
    const message = { v: 1 as const, action, provider, bootId, seq: ++seq, payload: titlePayload };
    const frame = encodeTitleFrame(bootId, seq, message);
    if (!document.head) {
      try {
        document.title = frame;
      } catch (error) {
        logError(error);
      }
      await waitForHead();
    }

    const previous = document.title.startsWith('\u200BMAC1|') ? '' : document.title;
    inFlightTitleFrame = frame;
    try {
      document.title = frame;
      await delay(10);
      if (document.title === inFlightTitleFrame) {
        document.title = previous;
        return;
      }
      document.title = frame;
      await delay(40);
      if (document.title === inFlightTitleFrame) document.title = previous;
    } finally {
      if (inFlightTitleFrame === frame) inFlightTitleFrame = undefined;
    }
  }

  function emitTitle(action: MessageAction, payload?: unknown, options: TitleEmitOptions = {}): void {
    if (action !== 'STATUS_REPORT' || options.immediate) {
      emitTitleNow(action, payload);
      return;
    }
    latestTitle = { action, payload };
    const elapsed = performance.now() - lastTitleEmitAt;
    if (elapsed >= 1000 && titleTimer === undefined) {
      const next = latestTitle;
      latestTitle = undefined;
      lastTitleEmitAt = performance.now();
      if (next) emitTitleNow(next.action, next.payload);
      return;
    }
    if (titleTimer !== undefined) return;
    titleTimer = window.setTimeout(() => {
      titleTimer = undefined;
      const next = latestTitle;
      latestTitle = undefined;
      lastTitleEmitAt = performance.now();
      if (next) emitTitleNow(next.action, next.payload);
    }, Math.max(0, 1000 - elapsed));
  }

  function enqueueBulk(
    message: Omit<BridgeMessage, 'v' | 'provider' | 'bootId' | 'mid'> & { action: BulkAction },
  ): OutboxEntry {
    let entry: OutboxEntry = {
      v: 1,
      ...message,
      action: message.action as MessageAction,
      provider: provider as BridgeMessage['provider'],
      bootId,
      mid: ++mid,
    };
    const originalSize = byteLength(JSON.stringify(entry));
    entry = capOutboxEntry(entry);
    if (byteLength(JSON.stringify(entry)) < originalSize) {
      degraded = true;
      degradedReason = entry.action === 'RESPONSE_DONE' ? 'done_truncated' : 'chunk_truncated';
    }
    const size = byteLength(JSON.stringify(entry));
    outbox.push(entry);
    outboxBytes += size;
    enforceOutboxCap();
    scheduleBulkHint(entry.action === 'RESPONSE_DONE');
    return entry;
  }

  function peekOutbox(): OutboxEntry[] {
    return peekOutboxBatch(outbox);
  }

  function ackBulk(maxMid: number): void {
    while (outbox.length > 0 && outbox[0].mid <= maxMid) {
      const entry = outbox.shift();
      if (entry) outboxBytes -= byteLength(JSON.stringify(entry));
    }
    if (outbox.length === 0) {
      degraded = false;
      degradedReason = undefined;
    }
    if (outbox.length > 0) scheduleBulkHint(false);
  }

  function enforceOutboxCap(): void {
    const next = enforceOutboxOverflow({ entries: outbox, bytes: outboxBytes, degraded, reason: degradedReason });
    outbox.splice(0, outbox.length, ...next.entries);
    outboxBytes = next.bytes;
    degraded = next.degraded;
    degradedReason = next.reason;
    if (degradedReason === 'outbox_full_no_chunk') {
      emitTitle('STATUS_REPORT', { bridge: 'degraded', reason: degradedReason }, { immediate: true });
    }
  }

  function scheduleBulkHint(immediate: boolean): void {
    if (hintTimer !== undefined) window.clearTimeout(hintTimer);
    const payload = () => (degraded ? { bridge: 'degraded', reason: degradedReason ?? 'outbox_degraded' } : {});
    if (immediate) {
      emitTitle('STATUS_REPORT', { ...payload(), doneReady: true }, { immediate: true });
      return;
    }
    hintTimer = window.setTimeout(() => {
      hintTimer = undefined;
      if (outbox.length > 0) emitTitle('STATUS_REPORT', payload());
    }, 0);
  }

  const bridge: MacBridge = {
    version: 1,
    bootId,
    emit(message: unknown) {
      const maybe = message as Partial<BridgeMessage>;
      if (maybe.action === 'RESPONSE_CHUNK' || maybe.action === 'RESPONSE_DONE' || maybe.action === 'REPORT_BROKEN') {
        enqueueBulk({ action: maybe.action, payload: maybe.payload });
        return;
      }
      if (maybe.action === 'STATUS_REPORT') {
        emitTitle('STATUS_REPORT', maybe.payload);
        return;
      }
      emitTitle('STATUS_REPORT', message);
    },
    dispatch(message: BridgeMessage) {
      if (dispatchHandler) {
        dispatchHandler(message);
      } else {
        queue.push(message);
      }
    },
    onDispatch(handler: (message: BridgeMessage) => void) {
      dispatchHandler = handler;
      while (queue.length > 0) {
        const message = queue.shift();
        if (message) handler(message);
      }
    },
    emitTitle,
    enqueueBulk,
    peekOutbox,
    ackBulk,
    sendBulk(action: BulkAction, payload?: unknown) {
      enqueueBulk({ action: action as MessageAction, payload });
      return Promise.resolve();
    },
  };

  window.__MAC_BRIDGE__ = bridge;

  const notifyRoute = () => emitTitle('STATUS_REPORT', { route: location.pathname, bootId }, { immediate: true });
  if (shouldPatchHistory(provider)) {
    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);

    history.pushState = (...args) => {
      const result = pushState(...args);
      notifyRoute();
      return result;
    };
    history.replaceState = (...args) => {
      const result = replaceState(...args);
      notifyRoute();
      return result;
    };
  }
  window.addEventListener('popstate', notifyRoute);

  emitTitle('STATUS_REPORT', { dom: 'unknown', bootId }, { immediate: true });

  function providerFromLabel(): string {
    if (typeof window.__MAC_PROVIDER__ === 'string' && window.__MAC_PROVIDER__) {
      return window.__MAC_PROVIDER__;
    }
    const host = location.hostname;
    if (host.includes('claude')) return 'claude';
    if (host.includes('gemini')) return 'gemini';
    if (host.includes('grok')) return 'grok';
    return 'chatgpt';
  }

  function randomId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('').slice(0, 8);
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function waitForHead(): Promise<void> {
    if (document.head) return Promise.resolve();
    return new Promise((resolve) => {
      let observer: MutationObserver | undefined;
      const done = () => {
        if (!document.head) return;
        document.removeEventListener('readystatechange', done);
        document.removeEventListener('DOMContentLoaded', done);
        observer?.disconnect();
        resolve();
      };
      document.addEventListener('readystatechange', done);
      document.addEventListener('DOMContentLoaded', done);
      if (document.documentElement) {
        observer = new MutationObserver(done);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
      done();
    });
  }
})();
