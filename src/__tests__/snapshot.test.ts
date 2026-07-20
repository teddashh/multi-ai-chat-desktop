import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import { DEFAULT_DEBATE_ROLES, PROMPTS } from '../../shared/constants';
import { publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { resetBridgePullForTests } from '../bridge/pull';
import { host } from '../host';
import { resetCancelState } from '../workflow/cancel';
import { resetWorkflowRuntimeForTests, runWorkflow } from '../workflow';
import { debateGraph, executeGraph } from '../workflow/graph';
import { flushSessionCheckpointForTests, resetSessionCheckpointForTests } from '../workflow/sessionCheckpoint';
import { resetAdapterVersionsForTests } from '../workflow/snapshot/adapterVersions';
import { resetWorkflowStateForTests, SKIP_RESPONSE } from '../workflow/state';
import { chooseStepTimeoutAction, resetStepTimeoutForTests } from '../workflow/stepTimeout';
import { resetWaitForResponseForTests } from '../workflow/waitForResponse';
import { getCurrentSnapshot, getLastSnapshot, resetSnapshotRecorderForTests } from '../workflow/snapshot/recorder';
import { getEventLogSnapshot, resetEventLogForTests } from '../diagnostics/eventLogStore';
import type { ExecutionSnapshot } from '../workflow/snapshot/types';

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

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];
const SNAPSHOT_ID_PATTERN = /^snapshot-[0-9a-f-]{36}$/;

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

function adapterUpdate(provider: AIProvider, adapterVersion: number): BridgeMessage {
  return { v: 1, action: 'ADAPTER_UPDATE', provider, payload: { adapterVersion, schemaVersion: 1 }, transport: 'local' };
}

describe('workflow execution snapshots', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetBusForTests();
    resetAdapterVersionsForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
    resetSessionCheckpointForTests();
    resetEventLogForTests();
    vi.mocked(host.app.version).mockResolvedValue('1.0.2-test');
    vi.mocked(host.provider.send).mockResolvedValue(undefined);
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));
    vi.mocked(host.snapshot.save).mockResolvedValue(undefined);
    vi.mocked(host.sessionCheckpoint.save).mockResolvedValue(undefined);
    vi.mocked(host.sessionCheckpoint.clear).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await flushSessionCheckpointForTests();
    await Promise.resolve();
    resetBusForTests();
    resetAdapterVersionsForTests();
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
      graphVersion: 2,
      appVersion: '1.0.2-test',
      roleMap: DEFAULT_DEBATE_ROLES,
      redactionTier: 'full-local',
      adapterVersions: {},
      userQuestion: {
        tier: 'full-local',
        kind: 'inline',
        text: 'debate question',
        byteLength: new TextEncoder().encode('debate question').byteLength,
      },
    });
    expect(snapshot?.snapshotId).toMatch(SNAPSHOT_ID_PATTERN);
    expect(snapshot?.createdAt).toEqual(expect.any(String));
    expect(snapshot?.completedAt).toEqual(expect.any(String));
    expect(snapshot?.humanEdits).toEqual([]);
    expect(snapshot?.steps).toHaveLength(4);
    const { pro, con, judge } = DEFAULT_DEBATE_ROLES;
    expect(sentPrompts).toEqual([
      PROMPTS.debate.pro('debate question'),
      PROMPTS.debate.con('debate question', `${pro}-answer`),
      PROMPTS.debate.judge('debate question', `${pro}-answer`, `${con}-answer`),
      PROMPTS.debate.summary('debate question', `${pro}-answer`, `${con}-answer`, `${judge}-answer`),
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
        provider: pro,
        input: PROMPTS.debate.pro('debate question'),
        output: `${pro}-answer`,
        status: 'done',
      },
      {
        nodeId: 'con',
        provider: con,
        input: PROMPTS.debate.con('debate question', `${pro}-answer`),
        output: `${con}-answer`,
        status: 'done',
      },
      {
        nodeId: 'judge',
        provider: judge,
        input: PROMPTS.debate.judge('debate question', `${pro}-answer`, `${con}-answer`),
        output: `${judge}-answer`,
        status: 'done',
      },
      {
        nodeId: 'summary',
        provider: DEFAULT_DEBATE_ROLES.summary,
        input: PROMPTS.debate.summary('debate question', `${pro}-answer`, `${con}-answer`, `${judge}-answer`),
        output: `${DEFAULT_DEBATE_ROLES.summary}-answer`,
        status: 'done',
      },
    ]);
    expect(snapshot?.steps.every((step) => step.startedAt && step.completedAt)).toBe(true);
    expect(snapshot?.steps[0].inputRef.byteLength).toBe(new TextEncoder().encode(PROMPTS.debate.pro('debate question')).byteLength);
  });

  it('records adapter versions only for updated providers used by the run', async () => {
    publishBridgeMessage(adapterUpdate('chatgpt', 11));
    publishBridgeMessage(adapterUpdate('claude', 22));
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'versioned free question', mode: 'free', targets: ['chatgpt', 'gemini'] })).resolves.toEqual({ ok: true });

    expect(getLastSnapshot()?.adapterVersions).toEqual({ chatgpt: 11 });
  });

  it('generates unique snapshot ids across runs', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'first question', mode: 'free', targets: ['chatgpt'] })).resolves.toEqual({ ok: true });
    const firstSnapshotId = getLastSnapshot()?.snapshotId;

    await expect(runWorkflow({ text: 'second question', mode: 'free', targets: ['chatgpt'] })).resolves.toEqual({ ok: true });
    const secondSnapshotId = getLastSnapshot()?.snapshotId;

    expect(firstSnapshotId).toMatch(SNAPSHOT_ID_PATTERN);
    expect(secondSnapshotId).toMatch(SNAPSHOT_ID_PATTERN);
    expect(secondSnapshotId).not.toBe(firstSnapshotId);
  });

  it('captures free-mode fanout child steps', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-free-answer`));
    });

    await expect(runWorkflow({ text: 'free question', mode: 'free', targets: ['chatgpt', 'gemini'] })).resolves.toEqual({ ok: true });

    const snapshot = getLastSnapshot();
    expect(snapshot).toMatchObject({
      graphId: 'free',
      graphVersion: 2,
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

  it('records free-mode send failures as error child steps', async () => {
    vi.mocked(host.provider.send).mockRejectedValueOnce(new Error('free failed'));

    await expect(runWorkflow({ text: 'free error question', mode: 'free', targets: ['chatgpt'] })).resolves.toEqual({ ok: true });

    const step = getLastSnapshot()?.steps[0];
    expect(step).toMatchObject({
      nodeId: 'fanout:0',
      provider: 'chatgpt',
      status: 'error',
      outputRef: { text: '[Error: free failed]' },
    });
    expect(step?.completedAt).toEqual(expect.any(String));
  });

  it('records resolved error-like responses as error steps', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, '[Error: provider rate limited]'));
    });

    await expect(runWorkflow({ text: 'sentinel question', mode: 'free', targets: ['chatgpt'] })).resolves.toEqual({ ok: true });

    const step = getLastSnapshot()?.steps[0];
    expect(step).toMatchObject({
      nodeId: 'fanout:0',
      provider: 'chatgpt',
      status: 'error',
      outputRef: { text: '[Error: provider rate limited]' },
    });
  });

  it('records serial send failures as error steps before rethrowing the original error', async () => {
    const conError = new Error('con send failed');
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      if (provider === DEFAULT_DEBATE_ROLES.pro) {
        publishBridgeMessage(done(provider, 'pro-answer'));
        return;
      }
      if (provider === DEFAULT_DEBATE_ROLES.con) throw conError;
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    const run = executeGraph(debateGraph, { text: 'serial error question', roles: DEFAULT_DEBATE_ROLES });
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(2));
    chooseStepTimeoutAction('cancel');

    await expect(run).rejects.toBe(conError);
    expect(getCurrentSnapshot()).toBeUndefined();
    const snapshot = getLastSnapshot();
    expect(snapshot?.completedAt).toEqual(expect.any(String));
    const step = snapshot?.steps.find((item) => item.nodeId === 'con');
    expect(step).toMatchObject({
      provider: DEFAULT_DEBATE_ROLES.con,
      status: 'error',
      outputRef: { text: '[Error: con send failed]' },
    });
    expect(step?.completedAt).toEqual(expect.any(String));
  });

  it('records skipped serial steps with the canonical skip output', async () => {
    const sentPrompts: string[] = [];
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sentPrompts.push(prompt);
      if (sentPrompts.length === 1) throw new Error('skip this step');
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    const run = runWorkflow({ text: 'skip question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES });
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    chooseStepTimeoutAction('skip');
    await expect(run).resolves.toEqual({ ok: true });

    const step = getLastSnapshot()?.steps.find((item) => item.nodeId === 'pro');
    expect(step).toMatchObject({
      provider: DEFAULT_DEBATE_ROLES.pro,
      status: 'skipped',
      outputRef: { text: SKIP_RESPONSE },
    });
    expect(step?.completedAt).toEqual(expect.any(String));
    expect(sentPrompts[1]).toBe(PROMPTS.debate.con('skip question', SKIP_RESPONSE));
  });

  it('completes a partial snapshot when CANCEL_WORKFLOW interrupts a run', async () => {
    const run = runWorkflow({ text: 'cancel question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES });
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));

    publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });

    await expect(run).resolves.toEqual({ ok: true });
    const snapshot = getLastSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot?.graphId).toBe('debate');
    expect(snapshot?.steps.length).toBeLessThan(4);
    expect(snapshot?.completedAt).toEqual(expect.any(String));
    expect(getCurrentSnapshot()).toBeUndefined();
  });

  it('does not persist completed snapshots when persistence is disabled', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(
      runWorkflow({
        text: 'private question',
        mode: 'free',
        targets: ['chatgpt'],
        snapshotPersistence: false,
        snapshotRedactionTier: 'full-local',
      }),
    ).resolves.toEqual({ ok: true });

    expect(host.snapshot.save).not.toHaveBeenCalled();
  });

  it('persists redacted completed snapshots when explicitly enabled', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(
      runWorkflow({
        text: 'private question',
        mode: 'free',
        targets: ['chatgpt'],
        snapshotPersistence: true,
        snapshotRedactionTier: 'metadata-only',
      }),
    ).resolves.toEqual({ ok: true });

    expect(host.snapshot.save).toHaveBeenCalledTimes(1);
    const [snapshotId, snapshotJson] = vi.mocked(host.snapshot.save).mock.calls[0];
    expect(snapshotId).toMatch(SNAPSHOT_ID_PATTERN);
    const persisted = JSON.parse(snapshotJson) as ExecutionSnapshot;
    expect(persisted).toMatchObject({
      snapshotId,
      graphId: 'free',
      redactionTier: 'metadata-only',
      userQuestion: {
        tier: 'metadata-only',
        kind: 'omitted',
      },
    });
    expect(persisted.userQuestion.byteLength).toBeUndefined();
    expect(persisted.steps[0].inputRef).toEqual({
      tier: 'metadata-only',
      kind: 'omitted',
    });
    expect(persisted.steps[0].outputRef).toEqual({
      tier: 'metadata-only',
      kind: 'omitted',
    });
    expect(persisted.steps[0].inputRef.byteLength).toBeUndefined();
    expect(persisted.steps[0].outputRef.byteLength).toBeUndefined();
    expect(snapshotJson).not.toContain('private question');
    expect(snapshotJson).not.toContain('chatgpt-answer');
  });

  it('keeps the workflow successful and records an event when snapshot save fails', async () => {
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });
    vi.mocked(host.snapshot.save).mockRejectedValueOnce(new Error('disk full at C:\\Users\\private\\snapshots'));

    await expect(
      runWorkflow({
        text: 'private question',
        mode: 'free',
        targets: ['chatgpt'],
        snapshotPersistence: true,
        snapshotRedactionTier: 'metadata-only',
      }),
    ).resolves.toEqual({ ok: true });

    const events = getEventLogSnapshot();
    expect(events.some((event) => event.summary === 'Snapshot save failed; run continued')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('C:\\Users\\private');
  });
});
