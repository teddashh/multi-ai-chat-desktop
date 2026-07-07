import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import { publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { resetBridgePullForTests } from '../bridge/pull';
import { host } from '../host';
import { resetCancelState } from '../workflow/cancel';
import { resetSnapshotRecorderForTests } from '../workflow/snapshot/recorder';
import { resetWorkflowStateForTests } from '../workflow/state';
import { resetStepTimeoutForTests } from '../workflow/stepTimeout';
import { resetWaitForResponseForTests } from '../workflow/waitForResponse';
import { resetWorkflowRuntimeForTests, runWorkflow } from '../workflow';
import {
  beginSessionCheckpoint,
  clearSessionCheckpoint,
  flushSessionCheckpointForTests,
  resetSessionCheckpointForTests,
  sha256Hex,
  updateSessionCheckpoint,
  type SessionCheckpoint,
} from '../workflow/sessionCheckpoint';
import { getEventLogSnapshot, resetEventLogForTests } from '../diagnostics/eventLogStore';

vi.mock('../host', () => ({
  host: {
    provider: {
      send: vi.fn(),
      eval: vi.fn(),
      evalWithCallback: vi.fn(),
    },
    connections: {
      get: vi.fn(),
    },
    bridge: {
      subscribeTitle: vi.fn(),
    },
    snapshot: {
      save: vi.fn(),
      list: vi.fn(),
      load: vi.fn(),
      delete: vi.fn(),
    },
    sessionCheckpoint: {
      save: vi.fn(),
      load: vi.fn(),
      clear: vi.fn(),
    },
  },
}));

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function state(provider: AIProvider, sendable = true): ProviderState {
  return {
    provider,
    webview: sendable ? 'loaded' : 'none',
    dom: sendable ? 'ready' : 'unknown',
    login: sendable ? 'logged_in' : 'unknown',
    thinking: false,
    lastStatusAt: 1,
  };
}

function done(provider: AIProvider, payload = 'final'): BridgeMessage {
  return { v: 1, action: 'RESPONSE_DONE', provider, payload, transport: 'pull' };
}

function savedCheckpoints(): SessionCheckpoint[] {
  return vi.mocked(host.sessionCheckpoint.save).mock.calls.map(([json]) => JSON.parse(json) as SessionCheckpoint);
}

describe('session checkpoint controller', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
    resetSessionCheckpointForTests();
    resetEventLogForTests();
    vi.mocked(host.provider.send).mockResolvedValue(undefined);
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));
    vi.mocked(host.snapshot.save).mockResolvedValue(undefined);
    vi.mocked(host.sessionCheckpoint.save).mockResolvedValue(undefined);
    vi.mocked(host.sessionCheckpoint.load).mockResolvedValue(null);
    vi.mocked(host.sessionCheckpoint.clear).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await flushSessionCheckpointForTests();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
    resetSessionCheckpointForTests();
    resetEventLogForTests();
  });

  it('begins with a blank hash and lazily fills the SHA-256 without storing question text', async () => {
    beginSessionCheckpoint({ graphId: 'debate', graphVersion: 1, mode: 'debate', question: 'abc' });

    await vi.waitFor(() => expect(host.sessionCheckpoint.save).toHaveBeenCalled());
    expect(savedCheckpoints()[0]).toMatchObject({
      graphId: 'debate',
      graphVersion: 1,
      mode: 'debate',
      questionHash: '',
      stepIndex: 0,
    });

    await flushSessionCheckpointForTests();
    const saves = vi.mocked(host.sessionCheckpoint.save).mock.calls.map(([json]) => json);
    expect(savedCheckpoints().at(-1)?.questionHash).toBe(ABC_SHA256);
    expect(saves.join('\n')).not.toContain('abc');
  });

  it('patches step index and pending checkpoint node id', async () => {
    beginSessionCheckpoint({ graphId: 'coding', graphVersion: 1, mode: 'coding', question: 'private task' });
    updateSessionCheckpoint({ stepIndex: 3, pendingCheckpointNodeId: 'coderV1' });
    await flushSessionCheckpointForTests();

    expect(savedCheckpoints().at(-1)).toMatchObject({
      graphId: 'coding',
      stepIndex: 3,
      pendingCheckpointNodeId: 'coderV1',
    });

    updateSessionCheckpoint({ pendingCheckpointNodeId: null });
    await flushSessionCheckpointForTests();
    expect(savedCheckpoints().at(-1)).not.toHaveProperty('pendingCheckpointNodeId');
  });

  it('clears through the host store', async () => {
    beginSessionCheckpoint({ graphId: 'free', graphVersion: 1, mode: 'free', question: 'clear me' });
    clearSessionCheckpoint();
    await flushSessionCheckpointForTests();

    expect(host.sessionCheckpoint.clear).toHaveBeenCalledTimes(1);
  });

  it('calls begin, update, and clear during a clean workflow run without persisting raw question text', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'raw private question', mode: 'free', targets: ['chatgpt'] })).resolves.toEqual({ ok: true });
    await flushSessionCheckpointForTests();

    const saveCalls = vi.mocked(host.sessionCheckpoint.save).mock.calls;
    expect(saveCalls.length).toBeGreaterThanOrEqual(2);
    expect(host.sessionCheckpoint.clear).toHaveBeenCalledTimes(1);
    expect(saveCalls.some(([json]) => (JSON.parse(json) as SessionCheckpoint).stepIndex > 0)).toBe(true);
    expect(saveCalls.map(([json]) => json).join('\n')).not.toContain('raw private question');
    expect(vi.mocked(host.sessionCheckpoint.clear).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(host.sessionCheckpoint.save).mock.invocationCallOrder[0],
    );
  });

  it('swallows save failures and keeps the run successful', async () => {
    vi.mocked(host.sessionCheckpoint.save).mockRejectedValue(new Error('disk full at C:\\Users\\private\\checkpoint'));
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'question survives save failure', mode: 'free', targets: ['chatgpt'] })).resolves.toEqual({ ok: true });
    await flushSessionCheckpointForTests();

    expect(getEventLogSnapshot().some((event) => event.summary === 'Session checkpoint failed; run continued')).toBe(true);
    expect(JSON.stringify(getEventLogSnapshot())).not.toContain('C:\\Users\\private');
  });

  it('computes the expected SHA-256 hex', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(ABC_SHA256);
  });
});
