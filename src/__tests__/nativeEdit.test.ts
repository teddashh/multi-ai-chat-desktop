import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeMessage } from '../../shared/types';
import { POLL_PULL_MS } from '../../shared/constants';
import { publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { resetBridgePullForTests } from '../bridge/pull';
import { host } from '../host';
import { getInFlightProviders, resetCancelState } from '../workflow/cancel';
import { fillAndAwaitNativeSend } from '../workflow/nativeEdit';
import { getActiveTurn, resetWorkflowStateForTests } from '../workflow/state';
import { hasWaiter, resetWaitForResponseForTests } from '../workflow/waitForResponse';

vi.mock('../host', () => ({
  host: {
    provider: {
      fill: vi.fn(),
      eval: vi.fn(),
      evalWithCallback: vi.fn(),
    },
  },
}));

function done(payload = 'native final'): BridgeMessage {
  return { v: 1, action: 'RESPONSE_DONE', provider: 'chatgpt', payload, transport: 'local' };
}

describe('fillAndAwaitNativeSend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetCancelState();
    vi.clearAllMocks();
    vi.mocked(host.provider.fill).mockResolvedValue(undefined);
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
  });

  afterEach(() => {
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetCancelState();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('fills the provider draft, waits for native DONE, and clears in-flight and awaiting state', async () => {
    const result = fillAndAwaitNativeSend('chatgpt', 'draft text');
    await Promise.resolve();

    expect(host.provider.fill).toHaveBeenCalledWith('chatgpt', 'draft text');
    expect(getInFlightProviders()).toEqual(['chatgpt']);
    expect(hasWaiter('chatgpt', 1)).toBe(true);
    expect(getActiveTurn('chatgpt')).toBe(1);

    await vi.advanceTimersByTimeAsync(POLL_PULL_MS);
    expect(host.provider.evalWithCallback).toHaveBeenCalled();

    publishBridgeMessage(done('native response'));
    await expect(result).resolves.toEqual({ response: 'native response', turn: 1 });
    expect(getInFlightProviders()).toEqual([]);
    expect(hasWaiter('chatgpt', 1)).toBe(false);
    expect(getActiveTurn('chatgpt')).toBeUndefined();

    const pullCalls = vi.mocked(host.provider.evalWithCallback).mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_PULL_MS * 2);
    expect(host.provider.evalWithCallback).toHaveBeenCalledTimes(pullCalls);
  });

  it('rejects the waiter, clears in-flight and awaiting state, and rethrows fill failures', async () => {
    const error = new Error('fill failed');
    vi.mocked(host.provider.fill).mockRejectedValueOnce(error);

    await expect(fillAndAwaitNativeSend('chatgpt', 'bad draft')).rejects.toThrow('fill failed');

    expect(hasWaiter('chatgpt', 1)).toBe(false);
    expect(getInFlightProviders()).toEqual([]);
    expect(getActiveTurn('chatgpt')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(POLL_PULL_MS * 2);
    expect(host.provider.evalWithCallback).not.toHaveBeenCalled();
  });
});
