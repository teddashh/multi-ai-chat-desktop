import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeMessage } from '../../shared/types';
import { OUTBOX_MAX_BYTES, POLL_PULL_MS, PULL_MAX_DECODED_BYTES } from '../../shared/constants';
import { isRenderableResponseMessage } from '../bridge/render';
import {
  ackOutbox,
  byteLength,
  capOutboxEntry,
  enforceOutboxOverflow,
  hasCloudflareChallengeSignals,
  type OutboxEntry,
  peekOutboxBatch,
  shouldDeferBridgeStart,
  shouldPatchHistory,
} from '../../injected/bootstrap';
import { onBridgeMessage } from '../bridge/bus';
import {
  AWAITING_ABSOLUTE_MAX_MS,
  AWAITING_MAX_MS,
  handleTitleMessage,
  parsePullResult,
  pullProvider,
  pullWithRetry,
  resetProviderBootState,
  resetProviderPullState,
  resetBridgePullForTests,
  setProviderAwaiting,
} from '../bridge/pull';
import { host } from '../host';

vi.mock('../host', () => ({
  host: {
    provider: {
      evalWithCallback: vi.fn(),
      eval: vi.fn(),
    },
    bridge: {
      subscribeTitle: vi.fn(),
    },
  },
}));

const provider = 'chatgpt';

function message(mid: number, bootId = 'b1', action: BridgeMessage['action'] = 'RESPONSE_CHUNK'): OutboxEntry {
  return { v: 1, action, provider, bootId, mid, payload: `m${mid}` };
}

function collectMessages() {
  const messages: BridgeMessage[] = [];
  const cleanup = onBridgeMessage((msg) => messages.push(msg));
  return { messages, cleanup };
}

describe('pull transport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetBridgePullForTests();
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetBridgePullForTests();
    vi.useRealTimers();
  });

  it('parses the real double-encoded callback shape', async () => {
    const batch = [message(1), message(2, 'b1', 'RESPONSE_DONE')];
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify(JSON.stringify(batch)));
    await expect(pullWithRetry(provider)).resolves.toEqual(batch);
    expect(host.provider.evalWithCallback).toHaveBeenCalledWith(
      provider,
      'window.__MAC_BRIDGE__ ? window.__MAC_BRIDGE__.peekOutbox() : []',
    );
    expect(parsePullResult(JSON.stringify(JSON.stringify(batch)))).toEqual(batch);
  });

  it('dedups real pullProvider batches and acks max mid once', async () => {
    const { messages, cleanup } = collectMessages();
    handleTitleMessage({ v: 1, action: 'STATUS_REPORT', provider, bootId: 'dedup', seq: 1, transport: 'title' });
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(
      JSON.stringify([message(1, 'dedup'), message(1, 'dedup'), message(2, 'dedup', 'RESPONSE_DONE')]),
    );
    await pullProvider(provider);
    cleanup();
    expect(messages.filter((msg) => msg.transport === 'pull').map((msg) => msg.mid)).toEqual([1, 2]);
    expect(host.provider.eval).toHaveBeenCalledWith(provider, 'window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.ackBulk(2);');
  });

  it('drops old-boot batches after title traffic establishes the active boot', async () => {
    const { messages, cleanup } = collectMessages();
    handleTitleMessage({ v: 1, action: 'STATUS_REPORT', provider, bootId: 'active', seq: 1, transport: 'title' });
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([message(1, 'old'), message(1, 'active')]));
    await pullProvider(provider);
    cleanup();
    expect(messages.filter((msg) => msg.transport === 'pull').map((msg) => msg.bootId)).toEqual(['active']);
  });

  it('splits navigation boot reset from retry high-water preservation', async () => {
    vi.useFakeTimers();
    const { messages, cleanup } = collectMessages();

    handleTitleMessage({ v: 1, action: 'STATUS_REPORT', provider, bootId: 'old', seq: 1, transport: 'title' });
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([message(1, 'old', 'RESPONSE_DONE')]));
    await pullProvider(provider);
    expect(messages.filter((msg) => msg.transport === 'pull').map((msg) => msg.bootId)).toEqual(['old']);

    resetProviderBootState(provider);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([message(1, 'new', 'RESPONSE_DONE')]));
    await pullProvider(provider);
    expect(messages.filter((msg) => msg.transport === 'pull').map((msg) => msg.bootId)).toEqual(['old', 'new']);

    handleTitleMessage({ v: 1, action: 'STATUS_REPORT', provider, bootId: 'retry', seq: 1, transport: 'title' });
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([message(1, 'retry', 'RESPONSE_DONE')]));
    await pullProvider(provider);
    resetProviderPullState(provider);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([message(1, 'retry', 'RESPONSE_DONE')]));
    await pullProvider(provider);
    cleanup();
    expect(messages.filter((msg) => msg.transport === 'pull' && msg.bootId === 'retry').map((msg) => msg.mid)).toEqual([1]);
  });

  it('marks degraded after retry failure, no-ops while degraded, and recovers on new bootId', async () => {
    const { messages, cleanup } = collectMessages();
    vi.mocked(host.provider.evalWithCallback).mockRejectedValue(new Error('timeout'));
    await pullProvider('claude');
    const callsAfterDegrade = vi.mocked(host.provider.evalWithCallback).mock.calls.length;
    await pullProvider('claude');
    handleTitleMessage({ v: 1, action: 'STATUS_REPORT', provider: 'claude', bootId: 'new', seq: 1, transport: 'title' });
    cleanup();
    expect(vi.mocked(host.provider.evalWithCallback).mock.calls.length).toBe(callsAfterDegrade);
    expect(messages.some((msg) => msg.transport === 'local' && msg.payload && (msg.payload as { bridge?: string }).bridge === 'degraded')).toBe(true);
    expect(messages.some((msg) => msg.transport === 'local' && msg.payload && (msg.payload as { bridge?: string }).bridge === 'ok')).toBe(true);
  });

  it('bulkReady title hints trigger a pull', async () => {
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    handleTitleMessage({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'gemini',
      bootId: 'hint',
      seq: 1,
      payload: { bulkReady: 1 },
      transport: 'title',
    });
    await vi.waitFor(() => expect(host.provider.evalWithCallback).toHaveBeenCalled());
  });

  it('does not synthesize degraded DONE during a silent stability window after a chunk hint', async () => {
    vi.useFakeTimers();
    const { messages, cleanup } = collectMessages();
    setProviderAwaiting(provider, true);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    handleTitleMessage({
      v: 1,
      action: 'STATUS_REPORT',
      provider,
      bootId: 'stable',
      seq: 1,
      payload: { bulkReady: 1 },
      transport: 'title',
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_100);
    expect(messages.some((msg) => msg.transport === 'local' && msg.action === 'RESPONSE_DONE')).toBe(false);

    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(
      JSON.stringify([{ ...message(2, 'stable', 'RESPONSE_DONE'), payload: 'real final' }]),
    );
    await pullProvider(provider);
    cleanup();
    expect(messages.some((msg) => msg.transport === 'local' && msg.payload === '[Error: bridge degraded]')).toBe(false);
    expect(messages.some((msg) => msg.transport === 'pull' && msg.action === 'RESPONSE_DONE' && msg.payload === 'real final')).toBe(true);
  });

  it('synthesizes error-as-DONE when a doneReady hint never yields a pulled DONE', async () => {
    vi.useFakeTimers();
    const { messages, cleanup } = collectMessages();
    setProviderAwaiting('grok', true);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    handleTitleMessage({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'grok',
      bootId: 'done-hint',
      seq: 1,
      payload: { bulkReady: 1, doneReady: true },
      transport: 'title',
    });
    await Promise.resolve();
    const callsBeforeWatchdog = vi.mocked(host.provider.evalWithCallback).mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    cleanup();
    expect(vi.mocked(host.provider.evalWithCallback).mock.calls.length).toBeGreaterThan(callsBeforeWatchdog);
    expect(messages.some((msg) => msg.transport === 'local' && msg.action === 'RESPONSE_DONE' && msg.payload === '[Error: bridge degraded]')).toBe(true);
  });

  it('uses provider thinking as activity but still degrades after the absolute cap', async () => {
    vi.useFakeTimers();
    const { messages, cleanup } = collectMessages();
    setProviderAwaiting(provider, true);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));

    const startedAt = Date.now();
    for (let heartbeat = 1; heartbeat <= 6; heartbeat += 1) {
      await vi.advanceTimersByTimeAsync(AWAITING_MAX_MS - 1_000);
      handleTitleMessage({
        v: 1,
        action: 'STATUS_REPORT',
        provider,
        bootId: 'long-task',
        seq: heartbeat,
        payload: { dom: 'ready', thinking: true },
        transport: 'title',
      });
    }

    expect(messages.some((msg) => msg.transport === 'local' && msg.payload === '[Error: bridge degraded]')).toBe(false);
    const remaining = AWAITING_ABSOLUTE_MAX_MS - (Date.now() - startedAt);
    await vi.advanceTimersByTimeAsync(remaining + POLL_PULL_MS + 1);
    cleanup();
    expect(messages.some((msg) => msg.transport === 'local' && msg.payload === '[Error: bridge degraded]')).toBe(true);
  });

  it('runs a distinct forced pull after an in-flight non-forced pull while still pending', async () => {
    setProviderAwaiting(provider, true);
    let resolveFirst!: (value: string) => void;
    const firstPull = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(host.provider.evalWithCallback)
      .mockImplementationOnce(() => firstPull)
      .mockResolvedValueOnce(JSON.stringify([]));

    const normalPull = pullProvider(provider);
    await vi.waitFor(() => expect(host.provider.evalWithCallback).toHaveBeenCalledTimes(1));
    const forcedPull = pullProvider(provider, { force: true });

    expect(host.provider.evalWithCallback).toHaveBeenCalledTimes(1);
    resolveFirst(JSON.stringify([]));
    await vi.waitFor(() => expect(host.provider.evalWithCallback).toHaveBeenCalledTimes(2));

    await normalPull;
    await forcedPull;
  });
});

describe('bootstrap outbox helpers', () => {
  it('keeps every provider passive until a Cloudflare challenge clears', () => {
    expect(hasCloudflareChallengeSignals('Just a moment...', 'Verifying you are human', false)).toBe(true);
    expect(hasCloudflareChallengeSignals('Grok', 'Please complete the security check', false)).toBe(true);
    expect(hasCloudflareChallengeSignals('Grok', '人間であることを確認しています', false)).toBe(true);
    expect(hasCloudflareChallengeSignals('Grok', 'Ready to chat', true)).toBe(true);
    expect(hasCloudflareChallengeSignals('Grok', 'Ready to chat', false)).toBe(false);
    expect(hasCloudflareChallengeSignals('Grok', '回答内容を確認しています', false)).toBe(false);
    expect(shouldDeferBridgeStart('grok', 'loading', false, false)).toBe(true);
    expect(shouldDeferBridgeStart('grok', 'complete', false, true)).toBe(true);
    expect(shouldDeferBridgeStart('grok', 'complete', true, true)).toBe(false);
    expect(shouldDeferBridgeStart('chatgpt', 'loading', false, true)).toBe(true);
    expect(shouldDeferBridgeStart('claude', 'complete', false, true)).toBe(true);
    expect(shouldDeferBridgeStart('claude', 'complete', false, false)).toBe(false);
  });

  it('does not monkey-patch Grok history during authentication', () => {
    expect(shouldPatchHistory('grok')).toBe(false);
    expect(shouldPatchHistory('chatgpt')).toBe(true);
    expect(shouldPatchHistory('claude')).toBe(true);
    expect(shouldPatchHistory('gemini')).toBe(true);
  });

  it('peek is non-destructive and respects the 1 MB batch boundary', () => {
    const entries = [message(1), message(2), message(3)];
    const batch = peekOutboxBatch(entries, byteLength(JSON.stringify([entries[0], entries[1]])));
    expect(batch).toHaveLength(2);
    expect(entries).toHaveLength(3);
  });

  it('ackBulk drops only entries at or below maxMid', () => {
    expect(ackOutbox([message(1), message(2), message(3)], 2).map((entry) => entry.mid)).toEqual([3]);
  });

  it('caps oversized chunks and marks oversized DONE payloads truncated', () => {
    const chunk = capOutboxEntry({ ...message(1), payload: 'x'.repeat(PULL_MAX_DECODED_BYTES * 2) });
    expect(byteLength(JSON.stringify(chunk))).toBeLessThanOrEqual(PULL_MAX_DECODED_BYTES);
    const done = capOutboxEntry({
      ...message(2, 'b1', 'RESPONSE_DONE'),
      payload: { data: 'x'.repeat(PULL_MAX_DECODED_BYTES * 2) },
    });
    expect(byteLength(JSON.stringify(done))).toBeLessThanOrEqual(PULL_MAX_DECODED_BYTES);
    expect((done.payload as { truncated?: boolean }).truncated).toBe(true);
  });

  it('marks oversized string DONE payloads truncated without exceeding the pull cap', () => {
    const done = capOutboxEntry({
      ...message(2, 'b1', 'RESPONSE_DONE'),
      payload: 'x'.repeat(PULL_MAX_DECODED_BYTES * 2),
    });
    expect(byteLength(JSON.stringify(done))).toBeLessThanOrEqual(PULL_MAX_DECODED_BYTES);
    expect(done.payload).toMatchObject({ truncated: true });
    expect(typeof (done.payload as { text?: unknown }).text).toBe('string');
  });

  it('10 MB overflow drops oldest chunks and never drops DONE', () => {
    const done = { ...message(3, 'b1', 'RESPONSE_DONE'), payload: 'final' };
    const entries = [
      { ...message(1), payload: 'x'.repeat(1024) },
      done,
      { ...message(2), payload: 'x'.repeat(1024) },
    ];
    const result = enforceOutboxOverflow({ entries, bytes: OUTBOX_MAX_BYTES + 1, degraded: false }, OUTBOX_MAX_BYTES);
    expect(result.degraded).toBe(true);
    expect(result.entries).toContain(done);
    expect(result.entries.some((entry) => entry.action === 'RESPONSE_CHUNK')).toBe(true);
  });

  it('title DONE is not authoritative', () => {
    const { messages, cleanup } = collectMessages();
    handleTitleMessage({ v: 1, action: 'RESPONSE_DONE', provider, bootId: 'title', seq: 1, payload: 'done', transport: 'title' });
    cleanup();
    expect(messages.some((msg) => msg.action === 'RESPONSE_DONE')).toBe(false);
  });

  it('App-side response gate rejects title-transport RESPONSE_DONE', () => {
    expect(
      isRenderableResponseMessage({ v: 1, action: 'RESPONSE_DONE', provider, bootId: 'title', seq: 1, payload: 'done', transport: 'title' }),
    ).toBe(false);
    expect(
      isRenderableResponseMessage({ v: 1, action: 'RESPONSE_DONE', provider, bootId: 'pull', mid: 1, payload: 'done', transport: 'pull' }),
    ).toBe(true);
  });
});
