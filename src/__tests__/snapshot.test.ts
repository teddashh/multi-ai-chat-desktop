import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import { DEFAULT_DEBATE_ROLES, PROMPTS } from '../../shared/constants';
import { publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { resetBridgePullForTests } from '../bridge/pull';
import { host } from '../host';
import { resetCancelState } from '../workflow/cancel';
import { resetWorkflowRuntimeForTests, runWorkflow } from '../workflow';
import { resetWorkflowStateForTests } from '../workflow/state';
import { resetStepTimeoutForTests } from '../workflow/stepTimeout';
import { resetWaitForResponseForTests } from '../workflow/waitForResponse';
import { getCurrentSnapshot, getLastSnapshot, resetSnapshotRecorderForTests } from '../workflow/snapshot/recorder';

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
  },
}));

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

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

describe('workflow execution snapshots', () => {
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
    vi.mocked(host.provider.send).mockResolvedValue(undefined);
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));
  });

  afterEach(async () => {
    await Promise.resolve();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
  });

  it('captures a completed debate run without changing the golden prompt threading', async () => {
    const sentPrompts: string[] = [];
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sentPrompts.push(prompt);
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'debate question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES })).resolves.toEqual({ ok: true });

    const snapshot = getLastSnapshot();
    expect(getCurrentSnapshot()).toBeUndefined();
    expect(snapshot).toMatchObject({
      graphId: 'debate',
      graphVersion: 1,
      roleMap: DEFAULT_DEBATE_ROLES,
      redactionTier: 'full-local',
      adapterVersions: {},
    });
    expect(snapshot?.snapshotId).toBe('snapshot-1');
    expect(snapshot?.createdAt).toEqual(expect.any(String));
    expect(snapshot?.completedAt).toEqual(expect.any(String));
    expect(snapshot?.humanEdits).toEqual([]);
    expect(snapshot?.steps).toHaveLength(4);
    expect(sentPrompts).toEqual([
      PROMPTS.debate.pro('debate question'),
      PROMPTS.debate.con('debate question', 'chatgpt-answer'),
      PROMPTS.debate.judge('debate question', 'chatgpt-answer', 'claude-answer'),
      PROMPTS.debate.summary('debate question', 'chatgpt-answer', 'claude-answer', 'grok-answer'),
    ]);
    expect(
      snapshot?.steps.map((step) => ({
        nodeId: step.nodeId,
        provider: step.provider,
        input: step.inputRef.text,
        output: step.outputRef.text,
        status: step.status,
      })),
    ).toEqual([
      {
        nodeId: 'pro',
        provider: 'chatgpt',
        input: PROMPTS.debate.pro('debate question'),
        output: 'chatgpt-answer',
        status: 'done',
      },
      {
        nodeId: 'con',
        provider: 'claude',
        input: PROMPTS.debate.con('debate question', 'chatgpt-answer'),
        output: 'claude-answer',
        status: 'done',
      },
      {
        nodeId: 'judge',
        provider: 'grok',
        input: PROMPTS.debate.judge('debate question', 'chatgpt-answer', 'claude-answer'),
        output: 'grok-answer',
        status: 'done',
      },
      {
        nodeId: 'summary',
        provider: 'gemini',
        input: PROMPTS.debate.summary('debate question', 'chatgpt-answer', 'claude-answer', 'grok-answer'),
        output: 'gemini-answer',
        status: 'done',
      },
    ]);
    expect(snapshot?.steps.every((step) => step.startedAt && step.completedAt)).toBe(true);
    expect(snapshot?.steps[0].inputRef.byteLength).toBe(new TextEncoder().encode(PROMPTS.debate.pro('debate question')).byteLength);
  });

  it('captures free-mode fanout child steps', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-free-answer`));
    });

    await expect(runWorkflow({ text: 'free question', mode: 'free', targets: ['chatgpt', 'gemini'] })).resolves.toEqual({ ok: true });

    const snapshot = getLastSnapshot();
    expect(snapshot).toMatchObject({
      graphId: 'free',
      graphVersion: 1,
      roleMap: {},
      redactionTier: 'full-local',
    });
    expect(snapshot?.steps.map((step) => step.nodeId)).toEqual(['fanout:0', 'fanout:1']);
    expect(
      snapshot?.steps.map((step) => ({
        provider: step.provider,
        input: step.inputRef.text,
        output: step.outputRef.text,
        status: step.status,
      })),
    ).toEqual([
      { provider: 'chatgpt', input: 'free question', output: 'chatgpt-free-answer', status: 'done' },
      { provider: 'gemini', input: 'free question', output: 'gemini-free-answer', status: 'done' },
    ]);
    expect(snapshot?.createdAt).toEqual(expect.any(String));
    expect(snapshot?.completedAt).toEqual(expect.any(String));
  });
});
