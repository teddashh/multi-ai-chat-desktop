import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import { DEFAULT_CODING_ROLES, DEFAULT_DEBATE_ROLES, DEFAULT_FREE_TARGET_PROVIDERS, PROMPTS } from '../../shared/constants';
import { onBridgeMessage, publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { resetBridgePullForTests } from '../bridge/pull';
import { host } from '../host';
import { resetCancelState } from '../workflow/cancel';
import { executeGraph, workflowGraphs } from '../workflow/graph';
import { resetWorkflowRuntimeForTests } from '../workflow/runtime';
import { flushSessionCheckpointForTests, resetSessionCheckpointForTests } from '../workflow/sessionCheckpoint';
import { getLastSnapshot, resetSnapshotRecorderForTests } from '../workflow/snapshot/recorder';
import {
  parseStoredSnapshot,
  planReplay,
  replaySnapshot,
  SnapshotReplayError,
} from '../workflow/snapshot/replay';
import type { AIProviderV2, ExecutionSnapshot, RedactedValueRef, SnapshotRedactionTier } from '../workflow/snapshot/types';
import { resetWorkflowStateForTests } from '../workflow/state';
import { resetStepTimeoutForTests } from '../workflow/stepTimeout';
import { resetWaitForResponseForTests } from '../workflow/waitForResponse';

vi.mock('../host', () => ({
  host: {
    app: {
      version: vi.fn(),
    },
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

vi.mock('../workflow/graph', async () => {
  const actual = await vi.importActual<typeof import('../workflow/graph')>('../workflow/graph');
  return {
    ...actual,
    executeGraph: vi.fn(actual.executeGraph),
  };
});

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];
const HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

function done(provider: AIProvider, payload = `${provider}-answer`): BridgeMessage {
  return { v: 1, action: 'RESPONSE_DONE', provider, payload, transport: 'pull' };
}

describe('snapshot replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
    resetSessionCheckpointForTests();
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider));
    });
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));
    vi.mocked(host.snapshot.load).mockResolvedValue(null);
    vi.mocked(host.app.version).mockResolvedValue('');
    vi.mocked(host.sessionCheckpoint.save).mockResolvedValue(undefined);
    vi.mocked(host.sessionCheckpoint.clear).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await flushSessionCheckpointForTests();
    await Promise.resolve();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
    resetSessionCheckpointForTests();
  });

  it('plans a version-matched snapshot and derives free replay targets', () => {
    const snapshot = buildSnapshot({
      graphId: 'free',
      roleMap: {},
      userQuestion: inlineRef('free question'),
      steps: [
        step('fanout:0', { provider: 'chatgpt', input: inlineRef('free question'), output: inlineRef('one') }),
        step('fanout:1', { provider: 'gemini', input: inlineRef('free question'), output: inlineRef('two') }),
        step('fanout:2', { provider: 'chatgpt', input: inlineRef('free question'), output: inlineRef('three') }),
      ],
    });

    const plan = planReplay(snapshot);

    expect(plan.blocked).toBeUndefined();
    expect(plan.graph).toBe(workflowGraphs.free);
    expect(plan.roles).toEqual({});
    expect(plan.targets).toEqual(['chatgpt', 'gemini']);
    expect(plan.question).toBe('free question');
    expect(plan.needsQuestion).toBe(false);
    expect(plan.textComparable).toBe(true);
  });

  it('blocks graph version mismatches unless the caller opts into the current graph', async () => {
    const snapshot = buildSnapshot({ graphVersion: 2 });

    expect(planReplay(snapshot)).toMatchObject({
      blocked: 'graph-version-mismatch',
      detail: { snapshotVersion: 2, currentVersion: 1 },
    });

    await expect(replaySnapshot({ snapshot }, {})).resolves.toEqual({
      ok: false,
      blocked: 'graph-version-mismatch',
      detail: { snapshotVersion: 2, currentVersion: 1 },
    });
    expect(executeGraph).not.toHaveBeenCalled();

    await expect(replaySnapshot({ snapshot }, { replayWithCurrentGraph: true })).resolves.toMatchObject({ ok: true });
    expect(executeGraph).toHaveBeenCalledTimes(1);
  });

  it('blocks unknown graph ids and does not execute', async () => {
    const snapshot = buildSnapshot({ graphId: 'missing-graph' });

    expect(planReplay(snapshot)).toMatchObject({
      blocked: 'unknown-graph',
      detail: { graphId: 'missing-graph' },
    });
    await expect(replaySnapshot({ snapshot }, {})).resolves.toEqual({
      ok: false,
      blocked: 'unknown-graph',
      detail: { graphId: 'missing-graph' },
    });
    expect(executeGraph).not.toHaveBeenCalled();
  });

  it('requires a caller question for metadata-only snapshots and does not execute', async () => {
    const snapshot = buildSnapshot({
      redactionTier: 'metadata-only',
      steps: [step('pro', { input: omittedRef('metadata-only'), output: omittedRef('metadata-only') })],
    });

    expect(planReplay(snapshot)).toMatchObject({
      needsQuestion: true,
      textComparable: false,
    });
    await expect(replaySnapshot({ snapshot }, {})).resolves.toEqual({ ok: false, blocked: 'question-required' });
    expect(executeGraph).not.toHaveBeenCalled();
  });

  it('uses the raw prompt-text userQuestion instead of rendered step inputs', () => {
    const snapshot = buildSnapshot({
      graphId: 'consult',
      redactionTier: 'prompt-text',
      roleMap: { first: 'chatgpt', second: 'grok', reviewer: 'claude', summary: 'gemini' },
      userQuestion: inlineRef('prompt text question', 'prompt-text'),
      steps: [
        step('first', {
          provider: 'chatgpt',
          input: inlineRef(PROMPTS.consult.first('prompt text question'), 'prompt-text'),
          output: hashRef(HASH, 'prompt-text'),
        }),
        step('reviewer', { provider: 'claude', input: inlineRef('review prompt', 'prompt-text'), output: hashRef(HASH, 'prompt-text') }),
      ],
    });

    expect(planReplay(snapshot)).toMatchObject({
      question: 'prompt text question',
      needsQuestion: false,
      textComparable: true,
    });
  });

  it('accepts caller-supplied questions for metadata-only snapshots and executes with derived roles', async () => {
    const snapshot = buildSnapshot({
      redactionTier: 'metadata-only',
      steps: [step('pro', { input: omittedRef('metadata-only'), output: omittedRef('metadata-only') })],
    });

    await expect(replaySnapshot({ snapshot, question: 'caller metadata question' }, {})).resolves.toMatchObject({ ok: true });

    expect(executeGraph).toHaveBeenCalledWith(
      workflowGraphs.debate,
      { text: 'caller metadata question', roles: DEFAULT_DEBATE_ROLES, targets: undefined },
      { onSnapshotComplete: undefined },
    );
  });

  it('accepts caller-supplied questions for hashes snapshots and executes with derived free targets', async () => {
    const snapshot = buildSnapshot({
      graphId: 'free',
      redactionTier: 'hashes',
      roleMap: {},
      steps: [
        step('fanout:0', { provider: 'chatgpt', input: hashRef(HASH), output: hashRef(HASH) }),
        step('fanout:1', { provider: 'gemini', input: hashRef(HASH), output: hashRef(HASH) }),
      ],
    });

    await expect(replaySnapshot({ snapshot, question: 'caller hashes question' }, {})).resolves.toMatchObject({ ok: true });

    expect(executeGraph).toHaveBeenCalledWith(
      workflowGraphs.free,
      { text: 'caller hashes question', roles: {}, targets: ['chatgpt', 'gemini'] },
      { onSnapshotComplete: undefined },
    );
  });

  it('falls back to the four shipped free targets when a free snapshot has no derived targets', async () => {
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));
    const snapshot = buildSnapshot({
      graphId: 'free',
      roleMap: {},
      userQuestion: inlineRef('legacy free replay'),
      steps: [],
    });

    await expect(replaySnapshot({ snapshot }, {})).resolves.toMatchObject({ ok: true });

    expect(planReplay(snapshot).targets).toBeUndefined();
    expect(executeGraph).toHaveBeenCalledWith(
      workflowGraphs.free,
      { text: 'legacy free replay', roles: {}, targets: [...DEFAULT_FREE_TARGET_PROVIDERS] },
      { onSnapshotComplete: undefined },
    );
  });

  it('exposes full-local prior outputs for comparison', () => {
    const snapshot = buildSnapshot({
      steps: [
        step('pro', { output: inlineRef('prior pro output') }),
        step('con', { provider: 'claude', input: inlineRef('con prompt'), output: inlineRef('prior con output') }),
      ],
    });

    expect(planReplay(snapshot).priorOutputs).toEqual({
      pro: 'prior pro output',
      con: 'prior con output',
    });
  });

  it('exposes prior output hashes for hashes-tier snapshots', () => {
    const snapshot = buildSnapshot({
      redactionTier: 'hashes',
      steps: [step('pro', { input: hashRef(HASH), output: hashRef(HASH) })],
    });

    expect(planReplay(snapshot)).toMatchObject({
      priorHashes: { pro: HASH },
      needsQuestion: true,
      textComparable: false,
    });
  });

  it('reports parse and schema errors for untrusted stored JSON', () => {
    expect(() => parseStoredSnapshot('{bad')).toThrow(SnapshotReplayError);
    expect(captureReplayError(() => parseStoredSnapshot('{bad'))?.kind).toBe('parse');

    const badSchema = JSON.stringify({
      snapshotId: 'snapshot-bad',
      graphId: 'debate',
      graphVersion: 1,
      redactionTier: 'full-local',
      roleMap: { pro: 1 },
      steps: [],
    });
    expect(captureReplayError(() => parseStoredSnapshot(badSchema))?.kind).toBe('schema');

    const badStepSchema = JSON.stringify({
      snapshotId: 'snapshot-bad-step',
      graphId: 'debate',
      graphVersion: 1,
      redactionTier: 'full-local',
      userQuestion: inlineRef('stored question'),
      roleMap: DEFAULT_DEBATE_ROLES,
      steps: [{}],
    });
    expect(captureReplayError(() => parseStoredSnapshot(badStepSchema))?.kind).toBe('schema');
  });

  it('returns not-found when durable snapshot load misses and does not execute', async () => {
    vi.mocked(host.snapshot.load).mockResolvedValue(null);

    await expect(replaySnapshot({ snapshotId: 'snapshot-missing' }, {})).resolves.toEqual({ ok: false, blocked: 'not-found' });
    expect(executeGraph).not.toHaveBeenCalled();
  });

  it('blocks on serial preflight with current unavailable sessions and does not execute', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([state('chatgpt'), state('claude', false), state('gemini'), state('grok')]);

    await expect(replaySnapshot({ snapshot: buildSnapshot() }, {})).resolves.toEqual({
      ok: false,
      blocked: 'preflight',
      preflight: { ok: false, unavailable: ['claude'], aliased: [] },
    });
    expect(executeGraph).not.toHaveBeenCalled();
  });

  it('loads, plans, preflights, and executes through the normal graph path', async () => {
    const snapshot = buildSnapshot({ snapshotId: 'snapshot-source' });
    vi.mocked(host.snapshot.load).mockResolvedValue(JSON.stringify(snapshot));
    const onSnapshotComplete = vi.fn();
    vi.mocked(host.app.version).mockResolvedValue('1.0.2-test');
    const messages: BridgeMessage[] = [];
    const unsubscribe = onBridgeMessage((message) => messages.push(message));

    const result = await replaySnapshot({ snapshotId: 'snapshot-source' }, { onSnapshotComplete });

    unsubscribe();
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.newSnapshotId).toMatch(/^snapshot-[0-9a-f-]{36}$/);
    expect(result.ok && result.newSnapshotId).not.toBe('snapshot-source');
    expect(getLastSnapshot()?.snapshotId).toBe(result.ok ? result.newSnapshotId : undefined);
    expect(onSnapshotComplete).toHaveBeenCalledTimes(1);
    expect(executeGraph).toHaveBeenCalledTimes(1);
    expect(executeGraph).toHaveBeenCalledWith(
      workflowGraphs.debate,
      { text: 'clean replay question', roles: DEFAULT_DEBATE_ROLES, targets: undefined },
      { onSnapshotComplete, appVersion: '1.0.2-test' },
    );
    expect(getLastSnapshot()?.appVersion).toBe('1.0.2-test');
    expect(messages.some((message) => message.action === 'WORKFLOW_STATUS')).toBe(true);
    expect(messages.some((message) => message.action === 'ROLE_ASSIGNMENT')).toBe(true);
  });

  it('replays coding snapshots with the raw question, not the wrapped planner prompt', async () => {
    const snapshot = buildSnapshot({
      graphId: 'coding',
      roleMap: { ...DEFAULT_CODING_ROLES },
      userQuestion: inlineRef('clean coding replay question'),
      steps: [
        step('plannerSpec', {
          provider: DEFAULT_CODING_ROLES.planner,
          input: inlineRef(PROMPTS.coding.plannerSpec('clean coding replay question')),
          output: inlineRef('prior spec'),
        }),
      ],
    });

    await expect(replaySnapshot({ snapshot }, {})).resolves.toMatchObject({ ok: true });

    expect(executeGraph).toHaveBeenCalledWith(
      workflowGraphs.coding,
      { text: 'clean coding replay question', roles: DEFAULT_CODING_ROLES, targets: undefined },
      { onSnapshotComplete: undefined },
    );
  });

  it('drops free replay targets that are no longer sendable', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([state('chatgpt'), state('claude', false), state('gemini'), state('grok')]);
    const snapshot = buildSnapshot({
      graphId: 'free',
      roleMap: {},
      userQuestion: inlineRef('free replay sendability'),
      steps: [
        step('fanout:0', { provider: 'chatgpt', input: inlineRef('free replay sendability'), output: inlineRef('one') }),
        step('fanout:1', { provider: 'claude', input: inlineRef('free replay sendability'), output: inlineRef('two') }),
      ],
    });

    await expect(replaySnapshot({ snapshot }, {})).resolves.toMatchObject({ ok: true });

    expect(executeGraph).toHaveBeenCalledWith(
      workflowGraphs.free,
      { text: 'free replay sendability', roles: {}, targets: ['chatgpt'] },
      { onSnapshotComplete: undefined },
    );
    expect(host.provider.send).toHaveBeenCalledTimes(1);
    expect(host.provider.send).toHaveBeenCalledWith('chatgpt', 'free replay sendability');
  });

  it('honors CANCEL_WORKFLOW during replay before any prior workflow run', async () => {
    resetWorkflowRuntimeForTests();
    vi.mocked(host.provider.send).mockResolvedValue(undefined);
    const snapshot = buildSnapshot();

    const run = replaySnapshot({ snapshot }, {});
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));

    publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });

    await expect(run).rejects.toThrow('Workflow cancelled by user');
    await vi.waitFor(() =>
      expect(host.provider.eval).toHaveBeenCalledWith(
        DEFAULT_DEBATE_ROLES.pro,
        "window.__MAC_ENGINE__ && typeof window.__MAC_ENGINE__.stop === 'function' && window.__MAC_ENGINE__.stop();",
      ),
    );
    const sendCount = vi.mocked(host.provider.send).mock.calls.length;
    publishBridgeMessage(done(DEFAULT_DEBATE_ROLES.pro, 'late cancelled'));
    expect(vi.mocked(host.provider.send).mock.calls.length).toBe(sendCount);
  });
});

function buildSnapshot(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  const redactionTier = overrides.redactionTier ?? 'full-local';
  const userQuestion = overrides.userQuestion ?? questionRefForTier('clean replay question', redactionTier);
  return {
    snapshotId: 'snapshot-source',
    graphId: 'debate',
    graphVersion: 1,
    appVersion: '0.0.0-test',
    createdAt: '2026-07-06T00:00:00.000Z',
    completedAt: '2026-07-06T00:01:00.000Z',
    adapterVersions: {},
    roleMap: { ...DEFAULT_DEBATE_ROLES },
    redactionTier,
    userQuestion,
    steps: [step('pro', { input: inlineRef(PROMPTS.debate.pro('clean replay question'), redactionTier) })],
    humanEdits: [],
    ...overrides,
  };
}

function step(
  nodeId: string,
  overrides: {
    provider?: AIProviderV2;
    input?: RedactedValueRef;
    output?: RedactedValueRef;
  } = {},
): ExecutionSnapshot['steps'][number] {
  return {
    nodeId,
    provider: overrides.provider ?? 'chatgpt',
    inputRef: overrides.input ?? inlineRef('clean replay question'),
    outputRef: overrides.output ?? inlineRef('prior output'),
    status: 'done',
    startedAt: '2026-07-06T00:00:01.000Z',
    completedAt: '2026-07-06T00:00:02.000Z',
  };
}

function inlineRef(text: string, tier: SnapshotRedactionTier = 'full-local'): RedactedValueRef {
  return {
    tier,
    kind: 'inline',
    text,
    byteLength: new TextEncoder().encode(text).byteLength,
  };
}

function questionRefForTier(text: string, tier: SnapshotRedactionTier): RedactedValueRef {
  if (tier === 'metadata-only') return omittedRef(tier);
  if (tier === 'hashes') return hashRef(HASH, tier);
  return inlineRef(text, tier);
}

function hashRef(sha256: string, tier: SnapshotRedactionTier = 'hashes'): RedactedValueRef {
  return {
    tier,
    kind: 'hash',
    sha256,
    byteLength: 32,
  };
}

function omittedRef(tier: SnapshotRedactionTier): RedactedValueRef {
  return {
    tier,
    kind: 'omitted',
  };
}

function captureReplayError(fn: () => unknown): SnapshotReplayError | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof SnapshotReplayError ? error : undefined;
  }
}
