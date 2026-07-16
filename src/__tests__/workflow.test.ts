import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import {
  AI_PROVIDERS,
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
  POLL_PULL_MS,
  PROMPTS,
} from '../../shared/constants';
import { onBridgeMessage, publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { AWAITING_MAX_MS, pullProvider, resetBridgePullForTests } from '../bridge/pull';
import { host } from '../host';
import { getInFlightProviders, resetCancelState } from '../workflow/cancel';
import { hasPendingCheckpoint, onCheckpoint, resetCheckpointForTests, resolveCheckpoint, type PendingCheckpoint } from '../workflow/checkpoint';
import { emitSystemError } from '../workflow/events';
import { preflightSerialMode } from '../workflow/preflight';
import { isSendable } from '../workflow/sendability';
import { sendAndWait } from '../workflow/sendAndWait';
import { flushSessionCheckpointForTests, resetSessionCheckpointForTests } from '../workflow/sessionCheckpoint';
import { getLastSnapshot, resetSnapshotRecorderForTests } from '../workflow/snapshot/recorder';
import { runStep } from '../workflow/stepRunner';
import { getActiveTurn, reserveTurn, resetWorkflowStateForTests, SKIP_RESPONSE } from '../workflow/state';
import { chooseStepTimeoutAction, onStepTimeoutEvent, resetStepTimeoutForTests } from '../workflow/stepTimeout';
import { tearDownWaiters } from '../workflow/teardown';
import { STEP_TIMEOUT_MS, waitForResponse, resetWaitForResponseForTests, hasWaiter } from '../workflow/waitForResponse';
import { resetWorkflowRuntimeForTests, runWorkflow } from '../workflow';
import { createResponseLanguagePolicy } from '../workflow/responseLanguage';

vi.mock('../host', () => ({
  host: {
    provider: {
      send: vi.fn(),
      fill: vi.fn(),
      eval: vi.fn(),
      evalWithCallback: vi.fn(),
    },
    connections: {
      get: vi.fn(),
    },
    bridge: {
      subscribeTitle: vi.fn(),
    },
    sessionCheckpoint: {
      save: vi.fn(),
      load: vi.fn(),
      clear: vi.fn(),
    },
  },
}));

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

function providerName(provider: AIProvider): string {
  return AI_PROVIDERS[provider].name;
}

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

function done(provider: AIProvider, payload = 'final', transport: BridgeMessage['transport'] = 'pull'): BridgeMessage {
  return { v: 1, action: 'RESPONSE_DONE', provider, payload, transport };
}

describe('workflow engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetCheckpointForTests();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
    resetSessionCheckpointForTests();
    vi.mocked(host.provider.send).mockResolvedValue(undefined);
    vi.mocked(host.provider.fill).mockResolvedValue(undefined);
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));
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
    resetCheckpointForTests();
    resetStepTimeoutForTests();
    resetSnapshotRecorderForTests();
    resetSessionCheckpointForTests();
    vi.clearAllTimers();
    await Promise.resolve();
    vi.useRealTimers();
  });

  it('uses the tri-state sendable predicate', () => {
    expect(isSendable(state('chatgpt'))).toBe(true);
    expect(isSendable({ ...state('chatgpt'), login: 'logged_out' })).toBe(false);
  });

  it('resolves only authoritative RESPONSE_DONE, never pull chunks or title DONE', async () => {
    const promise = sendAndWait('chatgpt', 'hello');
    await Promise.resolve();
    publishBridgeMessage({ v: 1, action: 'RESPONSE_CHUNK', provider: 'chatgpt', payload: 'partial', transport: 'pull' });
    publishBridgeMessage(done('chatgpt', 'title final', 'title'));
    await vi.advanceTimersByTimeAsync(100);

    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    publishBridgeMessage(done('chatgpt', 'real final', 'pull'));
    await expect(promise).resolves.toEqual({ response: 'real final', turn: 1 });
  });

  it('registers the waiter before sending so a synchronous DONE from send resolves', async () => {
    vi.mocked(host.provider.send).mockImplementationOnce(async () => {
      publishBridgeMessage(done('claude', 'fast'));
    });
    await expect(sendAndWait('claude', 'fast prompt')).resolves.toEqual({ response: 'fast', turn: 1 });
  });

  it('keeps the engine timeout strictly after the pull awaiting cap', () => {
    expect(STEP_TIMEOUT_MS).toBe(AWAITING_MAX_MS + 30_000);
  });

  it('waitForResponse outer timeout rejects at 630s when no pull cap is armed', async () => {
    const promise = waitForResponse('grok', 99);
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS - 1);
    await expect(Promise.race([promise.then(() => 'settled'), Promise.resolve('pending')])).resolves.toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).rejects.toThrow('Grok response timed out after 630s');
  });

  it('real pull silent-provider path settles via the 600s cap before engine timeout', async () => {
    const promise = sendAndWait('gemini', 'silent');
    await vi.advanceTimersByTimeAsync(AWAITING_MAX_MS + 500);
    await expect(promise).resolves.toEqual({ response: '[Error: bridge degraded]', turn: 1 });
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS + 1);
  });

  it('keeps polling armed after a pulled chunk', async () => {
    const promise = sendAndWait('chatgpt', 'chunked');
    await Promise.resolve();
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(
      JSON.stringify([{ v: 1, action: 'RESPONSE_CHUNK', provider: 'chatgpt', bootId: 'b1', mid: 1, payload: 'partial' }]),
    );
    await pullProvider('chatgpt');
    const callsAfterChunk = vi.mocked(host.provider.evalWithCallback).mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_PULL_MS);
    expect(vi.mocked(host.provider.evalWithCallback).mock.calls.length).toBeGreaterThan(callsAfterChunk);
    publishBridgeMessage(done('chatgpt', 'final'));
    await expect(promise).resolves.toEqual({ response: 'final', turn: 1 });
  });

  it('blocks serial preflight for unavailable providers and same-provider consult aliasing', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([state('chatgpt'), state('claude', false), state('gemini'), state('grok')]);
    await expect(preflightSerialMode('debate', { pro: 'chatgpt', con: 'claude', judge: 'grok', summary: 'gemini' })).resolves.toMatchObject({
      ok: false,
      unavailable: ['claude'],
    });
    await expect(
      preflightSerialMode('consult', { first: 'chatgpt', second: 'chatgpt', reviewer: 'claude', summary: 'gemini' }),
    ).resolves.toMatchObject({ ok: false, aliased: ['chatgpt'] });
  });

  it('free mode sends only selected sendable targets and treats an empty target list as no-op', async () => {
    const statuses: string[] = [];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
    });
    vi.mocked(host.connections.get).mockResolvedValue([state('chatgpt'), state('claude', false), state('gemini'), state('grok')]);
    const run = runWorkflow({ text: 'q', mode: 'free', targets: ['chatgpt', 'claude'] });
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    publishBridgeMessage(done('chatgpt', 'ok'));
    await expect(run).resolves.toEqual({ ok: true });
    expect(host.provider.send).toHaveBeenCalledTimes(1);
    expect(host.provider.send).toHaveBeenCalledWith('chatgpt', 'q');
    expect(statuses).toEqual([`⚡ ${providerName('chatgpt')} answering in parallel…`, '']);

    vi.mocked(host.provider.send).mockClear();
    statuses.length = 0;
    await expect(runWorkflow({ text: 'q', mode: 'free', targets: [] })).resolves.toEqual({ ok: true });
    unsubscribe();
    expect(host.provider.send).not.toHaveBeenCalled();
    expect(statuses).toEqual(['']);
  });

  it('routes the brainstorm preset through provider-specific free fan-out and records its graph id', async () => {
    const prompts = new Map<AIProvider, string>();
    const statuses: string[] = [];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      prompts.set(provider, prompt);
      publishBridgeMessage(done(provider, `${provider}-ideas`));
    });

    await expect(
      runWorkflow({
        text: 'Invent a better new-user tutorial',
        mode: 'free',
        presetId: 'brainstorm',
        targets: providers,
        locale: 'de',
      }),
    ).resolves.toEqual({ ok: true });
    unsubscribe();

    for (const provider of providers) {
      expect(prompts.get(provider)).toBe(PROMPTS.brainstorm.buildPrompt('Invent a better new-user tutorial', provider));
    }
    expect(statuses[0]).toBe('✨ ChatGPT, Claude, Gemini und Grok sammeln Ideen…');
    expect(getLastSnapshot()?.graphId).toBe('brainstorm');
    expect(getLastSnapshot()?.userQuestion).toMatchObject({ kind: 'inline', text: 'Invent a better new-user tutorial' });
  });

  it('applies the same Auto response-language policy to every free and serial provider prompt', async () => {
    const policy = createResponseLanguagePolicy('auto', 'zh-TW');
    const freePrompts: string[] = [];
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      freePrompts.push(prompt);
      publishBridgeMessage(done(provider, `${provider}-free-answer`));
    });

    await expect(
      runWorkflow({
        text: 'Explain dependency injection in simple terms.',
        mode: 'free',
        targets: ['chatgpt', 'gemini'],
        responseLanguagePolicy: policy,
      }),
    ).resolves.toEqual({ ok: true });

    expect(freePrompts).toHaveLength(2);
    for (const prompt of freePrompts) {
      expect(prompt).toContain('Explain dependency injection in simple terms.');
      expect(prompt).toContain('<response-language-policy version="1" setting="auto" interface-locale="zh-TW">');
      expect(prompt).toContain('primary language of the user-authored prose');
      expect(prompt).toContain('Traditional Chinese (zh-TW) (the app interface language fallback)');
      expect(prompt.startsWith('<response-language-policy')).toBe(true);
      expect(prompt.endsWith('Explain dependency injection in simple terms.')).toBe(true);
    }

    vi.mocked(host.provider.send).mockClear();
    const serialPrompts: string[] = [];
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      serialPrompts.push(prompt);
      publishBridgeMessage(done(provider, `${provider}-serial-answer`));
    });

    await expect(
      runWorkflow({
        text: 'Should cities ban private cars downtown?',
        mode: 'debate',
        roles: DEFAULT_DEBATE_ROLES,
        responseLanguagePolicy: policy,
      }),
    ).resolves.toEqual({ ok: true });

    expect(serialPrompts).toHaveLength(4);
    expect(
      serialPrompts.every((prompt) =>
        prompt.includes('<response-language-policy version="1" setting="auto" interface-locale="zh-TW">'),
      ),
    ).toBe(true);
    expect(serialPrompts.every((prompt) => prompt.includes('Do not infer it from these workflow instructions, other AI responses'))).toBe(true);
    expect(serialPrompts.every((prompt) => prompt.startsWith('<response-language-policy'))).toBe(true);
  });

  it('replays restored conversation context without replacing the current snapshot question', async () => {
    let sentPrompt = '';
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sentPrompt = prompt;
      publishBridgeMessage(done(provider, 'continued answer'));
    });

    await expect(
      runWorkflow({
        text: 'What should we improve next?',
        context: 'User:\nReview this repository.\n\nClaude:\nStart with session continuity.',
        mode: 'free',
        targets: ['claude'],
      }),
    ).resolves.toEqual({ ok: true });

    expect(sentPrompt).toContain('Prior multi-AI conversation context from this same app conversation:');
    expect(sentPrompt).toContain('Claude:\nStart with session continuity.');
    expect(sentPrompt).toContain('Current user question:\nWhat should we improve next?');
    expect(getLastSnapshot()?.userQuestion.text).toBe('What should we improve next?');
  });

  it('send failures tear down their waiter and polling for serial and free-mode sends', async () => {
    vi.mocked(host.provider.send).mockRejectedValueOnce(new Error('send failed'));
    const serial = runStep('chatgpt', 'serial');
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    expect(hasWaiter('chatgpt', 1)).toBe(false);
    chooseStepTimeoutAction('cancel');
    await expect(serial).rejects.toThrow('send failed');
    await vi.advanceTimersByTimeAsync(POLL_PULL_MS * 2);
    expect(host.provider.evalWithCallback).not.toHaveBeenCalled();

    vi.mocked(host.provider.send).mockRejectedValueOnce(new Error('free failed'));
    await expect(runWorkflow({ text: 'free', mode: 'free', targets: ['chatgpt'] })).resolves.toEqual({ ok: true });
    expect(hasWaiter('chatgpt', 2)).toBe(false);
    await vi.advanceTimersByTimeAsync(POLL_PULL_MS * 2);
    expect(host.provider.evalWithCallback).not.toHaveBeenCalled();
  });

  it('waits for a timeout action supplied after the timeout event and then skips', async () => {
    const events: { provider: string; remainingMs: number; timedOut: boolean }[] = [];
    const unsubscribe = onStepTimeoutEvent((event) => events.push(event));
    const step = runStep('chatgpt', 'late skip');
    let settled = false;
    void step.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    vi.mocked(host.provider.evalWithCallback).mockRejectedValue(new Error('callback failed'));
    const degrade = pullProvider('chatgpt');
    await vi.advanceTimersByTimeAsync(1000);
    await degrade;
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);

    expect(events.some((event) => event.timedOut)).toBe(true);
    await Promise.resolve();
    expect(settled).toBe(false);

    chooseStepTimeoutAction('skip');
    await expect(step).resolves.toEqual({ response: SKIP_RESPONSE, turn: -1 });
    unsubscribe();
  });

  it('enforces one live waiter per provider so newer sends supersede older turns', async () => {
    const oldWaiter = waitForResponse('chatgpt', 1).catch((error: Error) => error.message);
    const newWaiter = waitForResponse('chatgpt', 2);
    expect(hasWaiter('chatgpt', 1)).toBe(false);
    expect(hasWaiter('chatgpt', 2)).toBe(true);
    publishBridgeMessage(done('chatgpt', 'new turn'));
    await expect(oldWaiter).resolves.toBe('superseded by a newer send');
    await expect(newWaiter).resolves.toBe('new turn');
    expect(hasWaiter('chatgpt', 2)).toBe(false);
  });

  it('retry stop-clicks before re-sending the same provider and prompt', async () => {
    vi.mocked(host.provider.send).mockRejectedValueOnce(new Error('first attempt failed')).mockResolvedValue(undefined);
    chooseStepTimeoutAction('retry');
    const step = runStep('chatgpt', 'retry prompt');
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(2));
    expect(host.provider.eval).toHaveBeenCalledWith(
      'chatgpt',
      "window.__MAC_ENGINE__ && typeof window.__MAC_ENGINE__.stop === 'function' && window.__MAC_ENGINE__.stop();",
    );
    expect(host.provider.send).toHaveBeenNthCalledWith(1, 'chatgpt', 'retry prompt');
    expect(host.provider.send).toHaveBeenNthCalledWith(2, 'chatgpt', 'retry prompt');
    expect(vi.mocked(host.provider.eval).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(host.provider.send).mock.invocationCallOrder[1],
    );
    expect(hasWaiter('chatgpt', 1)).toBe(false);
    expect(hasWaiter('chatgpt', 2)).toBe(true);
    publishBridgeMessage(done('chatgpt', 'retry final'));
    await expect(step).resolves.toEqual({ response: 'retry final', turn: 2 });
  });

  it('retry with a reserved turn preserves that turn across the re-send', async () => {
    vi.mocked(host.provider.send).mockRejectedValueOnce(new Error('first attempt failed')).mockResolvedValue(undefined);
    chooseStepTimeoutAction('retry');
    const step = runStep('chatgpt', 'reserved retry prompt', 42);
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(2));
    expect(hasWaiter('chatgpt', 42)).toBe(true);
    publishBridgeMessage(done('chatgpt', 'reserved retry final'));
    await expect(step).resolves.toEqual({ response: 'reserved retry final', turn: 42 });
  });

  it('retry after degraded clears degraded state, re-arms polling, and resolves via real pull', async () => {
    const step = runStep('claude', 'degraded retry');
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    vi.mocked(host.provider.evalWithCallback).mockRejectedValue(new Error('callback failed'));
    const degrade = pullProvider('claude');
    await vi.advanceTimersByTimeAsync(1000);
    await degrade;

    chooseStepTimeoutAction('retry');
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(2));
    const callsAfterRetry = vi.mocked(host.provider.evalWithCallback).mock.calls.length;
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(
      JSON.stringify([{ v: 1, action: 'RESPONSE_DONE', provider: 'claude', bootId: 'retry', mid: 1, payload: 'recovered' }]),
    );
    await vi.advanceTimersByTimeAsync(POLL_PULL_MS);
    expect(vi.mocked(host.provider.evalWithCallback).mock.calls.length).toBeGreaterThan(callsAfterRetry);
    await expect(step).resolves.toEqual({ response: 'recovered', turn: 2 });
  });

  it('skip returns the canonical substitution and flows it into the next serial prompt', async () => {
    const sentPrompts: string[] = [];
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sentPrompts.push(prompt);
      if (sentPrompts.length === 1) throw new Error('skip this step');
      publishBridgeMessage(done(provider, `answer-${sentPrompts.length}`));
    });
    const run = runWorkflow({ text: 'question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES });
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    chooseStepTimeoutAction('skip');
    await expect(run).resolves.toEqual({ ok: true });
    expect(sentPrompts[1]).toBe(PROMPTS.debate.con('question', SKIP_RESPONSE));
  });

  it('cancel action aborts, stop-clicks, tears down waiters, and rejects the step', async () => {
    const step = runStep('gemini', 'cancel prompt');
    const stepError = step.catch((error: Error) => error);
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    vi.mocked(host.provider.evalWithCallback).mockRejectedValue(new Error('callback failed'));
    const degrade = pullProvider('gemini');
    await vi.advanceTimersByTimeAsync(1000);
    await degrade;
    chooseStepTimeoutAction('cancel');
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);
    await expect(stepError).resolves.toMatchObject({ message: 'Gemini response timed out after 630s' });
    expect(host.provider.eval).toHaveBeenCalledWith(
      'gemini',
      "window.__MAC_ENGINE__ && typeof window.__MAC_ENGINE__.stop === 'function' && window.__MAC_ENGINE__.stop();",
    );
    expect(hasWaiter('gemini', 1)).toBe(false);
    publishBridgeMessage(done('gemini', 'late'));
    expect(hasWaiter('gemini', 1)).toBe(false);
  });

  it('CANCEL_WORKFLOW stop-clicks in-flight providers, rejects waiters, and stops after cancellation', async () => {
    const seen: BridgeMessage[] = [];
    const unsubscribe = onBridgeMessage((message) => seen.push(message));
    const run = runWorkflow({ text: 'q', mode: 'debate' });
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    expect(hasWaiter(DEFAULT_DEBATE_ROLES.pro, 1)).toBe(true);
    publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });
    await expect(run).resolves.toEqual({ ok: true });
    expect(host.provider.eval).toHaveBeenCalledWith(
      DEFAULT_DEBATE_ROLES.pro,
      "window.__MAC_ENGINE__ && typeof window.__MAC_ENGINE__.stop === 'function' && window.__MAC_ENGINE__.stop();",
    );
    expect(hasWaiter(DEFAULT_DEBATE_ROLES.pro, 1)).toBe(false);
    const sendCount = vi.mocked(host.provider.send).mock.calls.length;
    publishBridgeMessage(done(DEFAULT_DEBATE_ROLES.pro, 'late cancelled'));
    unsubscribe();
    expect(vi.mocked(host.provider.send).mock.calls.length).toBe(sendCount);
    expect(seen.filter((message) => message.action === 'ROLE_ASSIGNMENT')).toHaveLength(1);
  });

  it('teardown bumps the turn epoch and clears active turns', async () => {
    const firstTurn = reserveTurn('chatgpt');
    expect(getActiveTurn('chatgpt')).toBe(firstTurn);
    await tearDownWaiters(['chatgpt']);
    expect(getActiveTurn('chatgpt')).toBeUndefined();
    expect(reserveTurn('chatgpt')).toBe(firstTurn + 2);
  });

  it('consult emits both parallel role assignments before either send', async () => {
    const order: string[] = [];
    const statuses: string[] = [];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'ROLE_ASSIGNMENT') order.push(`role:${message.provider}`);
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      order.push(`send:${provider}`);
      publishBridgeMessage(done(provider));
    });
    await expect(runWorkflow({ text: 'q', mode: 'consult' })).resolves.toEqual({ ok: true });
    unsubscribe();
    expect(order.slice(0, 4)).toEqual(['role:chatgpt', 'role:grok', 'send:chatgpt', 'send:grok']);
    expect(statuses).toEqual([
      `🔍 ${providerName(DEFAULT_CONSULT_ROLES.first)} and ${providerName(DEFAULT_CONSULT_ROLES.second)} answering in parallel…`,
      `🔍 ${providerName(DEFAULT_CONSULT_ROLES.reviewer)} — Review in progress…`,
      `🔍 ${providerName(DEFAULT_CONSULT_ROLES.summary)} — Summary in progress…`,
      '',
    ]);
  });

  it.each([
    ['en', 'Pro argument'],
    ['zh-TW', '正方論述'],
    ['ja', '賛成側の論述'],
    ['de', 'Pro-Argument'],
  ] as const)('localizes serial workflow status and role labels in %s', async (locale, expectedLabel) => {
    const statuses: string[] = [];
    const labels: string[] = [];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
      if (message.action === 'ROLE_ASSIGNMENT') {
        const payload = message.payload as { label?: unknown };
        if (typeof payload.label === 'string') labels.push(payload.label);
      }
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(
      runWorkflow({ text: 'localized debate', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, locale }),
    ).resolves.toEqual({ ok: true });
    unsubscribe();

    expect(labels[0]).toBe(expectedLabel);
    expect(statuses[0]).toContain(expectedLabel);
  });

  it('debate preserves pro to con to judge to summary ordering and threaded prompts', async () => {
    const order: string[] = [];
    const prompts: string[] = [];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'ROLE_ASSIGNMENT') order.push(`role:${message.provider}`);
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      order.push(`send:${provider}`);
      prompts.push(prompt);
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });
    await expect(runWorkflow({ text: 'debate question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES })).resolves.toEqual({ ok: true });
    unsubscribe();
    expect(order).toEqual([
      'role:chatgpt',
      'send:chatgpt',
      'role:claude',
      'send:claude',
      'role:grok',
      'send:grok',
      'role:gemini',
      'send:gemini',
    ]);
    expect(prompts[1]).toBe(PROMPTS.debate.con('debate question', 'chatgpt-answer'));
    expect(prompts[2]).toBe(PROMPTS.debate.judge('debate question', 'chatgpt-answer', 'claude-answer'));
    expect(prompts[3]).toBe(PROMPTS.debate.summary('debate question', 'chatgpt-answer', 'claude-answer', 'grok-answer'));
  });

  it('does not checkpoint default debate runs', async () => {
    const checkpoints: PendingCheckpoint[] = [];
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (pending) checkpoints.push(pending);
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'default checkpoint off', mode: 'debate', roles: DEFAULT_DEBATE_ROLES })).resolves.toEqual({ ok: true });

    unsubscribeCheckpoint();
    expect(checkpoints).toEqual([]);
    expect(host.provider.send).toHaveBeenCalledTimes(4);
    expect(host.provider.fill).not.toHaveBeenCalled();
  });

  it('checkpoints debate, sends an edited confirmed draft, and records the human edit', async () => {
    const checkpoints: PendingCheckpoint[] = [];
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (!pending) return;
      checkpoints.push(pending);
      if (pending.nodeId !== 'pro') resolveCheckpoint(pending.nodeId, { action: 'confirm', draft: pending.draft });
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    const run = runWorkflow({ text: 'checkpoint question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, checkpoints: true });
    await vi.waitFor(() => expect(checkpoints.map((checkpoint) => checkpoint.nodeId)).toContain('pro'));
    expect(host.provider.send).not.toHaveBeenCalled();
    expect(checkpoints[0]).toMatchObject({
      nodeId: 'pro',
      sourceNodeId: 'pro',
      provider: DEFAULT_DEBATE_ROLES.pro,
      draft: PROMPTS.debate.pro('checkpoint question'),
    });

    resolveCheckpoint('pro', { action: 'confirm', draft: 'edited pro draft' });
    await expect(run).resolves.toEqual({ ok: true });

    unsubscribeCheckpoint();
    expect(host.provider.send).toHaveBeenNthCalledWith(1, DEFAULT_DEBATE_ROLES.pro, 'edited pro draft');
    expect(host.provider.fill).not.toHaveBeenCalled();
    expect(getLastSnapshot()?.humanEdits).toHaveLength(1);
    expect(getLastSnapshot()?.humanEdits[0]).toMatchObject({
      checkpointId: 'pro',
      sourceNodeId: 'pro',
      targetNodeId: 'pro',
      beforeRef: { text: PROMPTS.debate.pro('checkpoint question') },
      afterRef: { text: 'edited pro draft' },
    });
  });

  it('native-edit checkpoint fills the provider draft, captures the native response, and continues', async () => {
    const checkpoints: PendingCheckpoint[] = [];
    const statuses: string[] = [];
    const sent: { provider: AIProvider; prompt: string }[] = [];
    const unsubscribeStatus = onBridgeMessage((message) => {
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
    });
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (!pending) return;
      checkpoints.push(pending);
      if (pending.nodeId !== 'pro') resolveCheckpoint(pending.nodeId, { action: 'confirm', draft: pending.draft });
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sent.push({ provider, prompt });
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    const run = runWorkflow({ text: 'native checkpoint question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, checkpoints: true });
    await vi.waitFor(() => expect(checkpoints.map((checkpoint) => checkpoint.nodeId)).toContain('pro'));
    resolveCheckpoint('pro', { action: 'native-edit', draft: checkpoints[0].draft });
    await vi.waitFor(() => expect(host.provider.fill).toHaveBeenCalledTimes(1));

    expect(host.provider.send).not.toHaveBeenCalled();
    expect(host.provider.fill).toHaveBeenCalledWith(DEFAULT_DEBATE_ROLES.pro, PROMPTS.debate.pro('native checkpoint question'));

    publishBridgeMessage(done(DEFAULT_DEBATE_ROLES.pro, 'native pro answer'));
    await expect(run).resolves.toEqual({ ok: true });

    unsubscribeCheckpoint();
    unsubscribeStatus();
    expect(host.provider.send).not.toHaveBeenCalledWith(DEFAULT_DEBATE_ROLES.pro, expect.any(String));
    expect(statuses).toContain(
      `Draft inserted for ${providerName(DEFAULT_DEBATE_ROLES.pro)}. Edit and send it in the provider within 10 minutes.`,
    );
    expect(sent[0]).toEqual({
      provider: DEFAULT_DEBATE_ROLES.con,
      prompt: PROMPTS.debate.con('native checkpoint question', 'native pro answer'),
    });
    const proStep = getLastSnapshot()?.steps.find((step) => step.nodeId === 'pro');
    expect(proStep).toMatchObject({
      inputRef: { text: PROMPTS.debate.pro('native checkpoint question') },
      outputRef: { text: 'native pro answer' },
      status: 'done',
    });
  });

  it('CANCEL_WORKFLOW during native-edit wait clears the native waiter without sending for that provider', async () => {
    const checkpoints: PendingCheckpoint[] = [];
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (pending) checkpoints.push(pending);
    });
    const run = runWorkflow({ text: 'native cancel question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, checkpoints: true });

    await vi.waitFor(() => expect(checkpoints.map((checkpoint) => checkpoint.nodeId)).toContain('pro'));
    resolveCheckpoint('pro', { action: 'native-edit', draft: checkpoints[0].draft });
    await vi.waitFor(() => expect(host.provider.fill).toHaveBeenCalledTimes(1));

    expect(host.provider.fill).toHaveBeenCalledWith(DEFAULT_DEBATE_ROLES.pro, PROMPTS.debate.pro('native cancel question'));
    expect(hasWaiter(DEFAULT_DEBATE_ROLES.pro, 1)).toBe(true);
    expect(getInFlightProviders()).toEqual([DEFAULT_DEBATE_ROLES.pro]);

    publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });
    await expect(run).resolves.toEqual({ ok: true });

    unsubscribeCheckpoint();
    expect(hasWaiter(DEFAULT_DEBATE_ROLES.pro, 1)).toBe(false);
    expect(getInFlightProviders()).toEqual([]);
    expect(host.provider.send).not.toHaveBeenCalledWith(DEFAULT_DEBATE_ROLES.pro, expect.any(String));
  });

  it('records native-edit fill rejection as an error step and settles at workflow level', async () => {
    const fillError = new Error('fill rejected');
    const checkpoints: PendingCheckpoint[] = [];
    const seen: BridgeMessage[] = [];
    const unsubscribeBridge = onBridgeMessage((message) => seen.push(message));
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (pending) checkpoints.push(pending);
    });
    vi.mocked(host.provider.fill).mockRejectedValueOnce(fillError);

    const run = runWorkflow({ text: 'native fill failure', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, checkpoints: true });
    await vi.waitFor(() => expect(checkpoints.map((checkpoint) => checkpoint.nodeId)).toContain('pro'));
    resolveCheckpoint('pro', { action: 'native-edit', draft: checkpoints[0].draft });
    await vi.waitFor(() => expect(host.provider.fill).toHaveBeenCalledTimes(1));

    await expect(run).resolves.toEqual({ ok: true });

    unsubscribeCheckpoint();
    unsubscribeBridge();
    const proStep = getLastSnapshot()?.steps.find((step) => step.nodeId === 'pro');
    expect(proStep).toMatchObject({
      provider: DEFAULT_DEBATE_ROLES.pro,
      inputRef: { text: PROMPTS.debate.pro('native fill failure') },
      status: 'error',
      outputRef: { text: '[Error: fill rejected]' },
    });
    expect(proStep?.completedAt).toEqual(expect.any(String));
    expect(hasWaiter(DEFAULT_DEBATE_ROLES.pro, 1)).toBe(false);
    expect(getInFlightProviders()).toEqual([]);
    expect(seen).toContainEqual({ v: 1, action: 'RESPONSE_DONE', provider: 'system', payload: 'Error: fill rejected', transport: 'local' });
  });

  it('native-edit records control-pane draft edits before filling the provider', async () => {
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (!pending) return;
      resolveCheckpoint(pending.nodeId, {
        action: pending.nodeId === 'pro' ? 'native-edit' : 'confirm',
        draft: pending.nodeId === 'pro' ? 'edited native draft' : pending.draft,
      });
    });
    vi.mocked(host.provider.fill).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-native`));
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'native edit human edit', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, checkpoints: true })).resolves.toEqual({
      ok: true,
    });

    unsubscribeCheckpoint();
    expect(host.provider.fill).toHaveBeenCalledWith(DEFAULT_DEBATE_ROLES.pro, 'edited native draft');
    expect(getLastSnapshot()?.humanEdits).toHaveLength(1);
    expect(getLastSnapshot()?.humanEdits[0]).toMatchObject({
      checkpointId: 'pro',
      beforeRef: { text: PROMPTS.debate.pro('native edit human edit') },
      afterRef: { text: 'edited native draft' },
    });
    const proStep = getLastSnapshot()?.steps.find((step) => step.nodeId === 'pro');
    expect(proStep).toMatchObject({ inputRef: { text: 'edited native draft' }, outputRef: { text: 'chatgpt-native' } });
  });

  it('checkpoint skip does not send and flows SKIP_RESPONSE downstream with skipped status', async () => {
    const sent: { provider: AIProvider; prompt: string }[] = [];
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (!pending) return;
      if (pending.nodeId === 'pro') resolveCheckpoint(pending.nodeId, { action: 'skip' });
      else resolveCheckpoint(pending.nodeId, { action: 'confirm', draft: pending.draft });
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sent.push({ provider, prompt });
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(
      runWorkflow({ text: 'skip checkpoint question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, checkpoints: true }),
    ).resolves.toEqual({ ok: true });

    unsubscribeCheckpoint();
    expect(sent[0]).toEqual({
      provider: DEFAULT_DEBATE_ROLES.con,
      prompt: PROMPTS.debate.con('skip checkpoint question', SKIP_RESPONSE),
    });
    expect(sent.some((item) => item.provider === DEFAULT_DEBATE_ROLES.pro)).toBe(false);
    expect(host.provider.fill).not.toHaveBeenCalled();
    const skipped = getLastSnapshot()?.steps.find((step) => step.nodeId === 'pro');
    expect(skipped).toMatchObject({ status: 'skipped', outputRef: { text: SKIP_RESPONSE } });
  });

  it('does not checkpoint consult parallel first/second steps when checkpoints are enabled', async () => {
    const sent: { provider: AIProvider; prompt: string }[] = [];
    const checkpoints: PendingCheckpoint[] = [];
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (!pending) return;
      checkpoints.push(pending);
      resolveCheckpoint(pending.nodeId, { action: 'confirm', draft: pending.draft });
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sent.push({ provider, prompt });
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(runWorkflow({ text: 'consult checkpoint question', mode: 'consult', checkpoints: true })).resolves.toEqual({ ok: true });

    unsubscribeCheckpoint();
    expect(sent.slice(0, 2).map((item) => item.provider)).toEqual([DEFAULT_CONSULT_ROLES.first, DEFAULT_CONSULT_ROLES.second]);
    expect(checkpoints.map((checkpoint) => checkpoint.nodeId)).toEqual(['reviewer', 'summary']);
  });

  it('CANCEL_WORKFLOW rejects a pending checkpoint and settles without sending', async () => {
    const checkpoints: PendingCheckpoint[] = [];
    const unsubscribeCheckpoint = onCheckpoint((pending) => {
      if (pending) checkpoints.push(pending);
    });
    const run = runWorkflow({ text: 'cancel checkpoint question', mode: 'debate', roles: DEFAULT_DEBATE_ROLES, checkpoints: true });

    await vi.waitFor(() => expect(checkpoints.map((checkpoint) => checkpoint.nodeId)).toContain('pro'));
    expect(hasPendingCheckpoint('pro')).toBe(true);
    publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });

    await expect(run).resolves.toEqual({ ok: true });
    unsubscribeCheckpoint();
    expect(hasPendingCheckpoint('pro')).toBe(false);
    expect(host.provider.send).not.toHaveBeenCalled();
  });

  it('roundtable runs 5x4 with exact history growth and round labels', async () => {
    const historyLengths: number[] = [];
    const statuses: string[] = [];
    const roleLabels: string[] = [];
    let terminalHistory: { name: string; round: number; text: string }[] | undefined;
    const originalBuildPrompt = PROMPTS.roundtable.buildPrompt;
    const buildPromptSpy = vi.spyOn(PROMPTS.roundtable, 'buildPrompt').mockImplementation((question, round, speakerName, history) => {
      historyLengths.push(history.length);
      terminalHistory = history;
      return originalBuildPrompt(question, round, speakerName, history);
    });
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
      if (message.action === 'ROLE_ASSIGNMENT') {
        const payload = message.payload as { label?: unknown };
        if (typeof payload.label === 'string') roleLabels.push(payload.label);
      }
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `round-answer-${vi.mocked(host.provider.send).mock.calls.length}`));
    });
    await expect(
      runWorkflow({ text: 'roundtable question', mode: 'roundtable', roles: DEFAULT_ROUNDTABLE_ROLES, locale: 'en' }),
    ).resolves.toEqual({ ok: true });
    unsubscribe();
    buildPromptSpy.mockRestore();
    expect(host.provider.send).toHaveBeenCalledTimes(20);
    expect(historyLengths).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(terminalHistory).toHaveLength(20);
    expect(roleLabels.slice(0, 5)).toEqual(['Round 1', 'Round 1', 'Round 1', 'Round 1', 'Round 2']);
    for (const label of ['Opening positions', 'Cross-examination', 'Deepening the debate', 'Core convergence', 'Final synthesis']) {
      expect(statuses.some((status) => status.includes(label))).toBe(true);
    }
    expect(statuses.join('\n')).not.toMatch(/第\d+輪|開場立論|交叉質疑|攻防深化|核心收斂|真理浮現/);
  });

  it('coding runs the eight ported steps with distinct turns for repeated providers', async () => {
    const coderTurns: number[] = [];
    const roleAssignments: { role: string; label: string }[] = [];
    const statuses: string[] = [];
    const sent: { provider: AIProvider; prompt: string }[] = [];
    const sends: string[] = [];
    const responses = [
      'spec',
      'spec-review',
      'code-v1',
      'code-review',
      'test-report',
      'code-v2',
      'acceptance',
      'final-code',
    ];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
      if (message.action === 'ROLE_ASSIGNMENT') {
        const payload = message.payload as { role: string; label: string; turn: number };
        roleAssignments.push({ role: payload.role, label: payload.label });
        if (message.provider === DEFAULT_CODING_ROLES.coder) {
          coderTurns.push(payload.turn);
        }
      }
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      sent.push({ provider, prompt });
      sends.push(`${provider}:${prompt}`);
      publishBridgeMessage(done(provider, responses[sends.length - 1]));
    });
    await expect(runWorkflow({ text: 'feature', mode: 'coding', roles: DEFAULT_CODING_ROLES })).resolves.toEqual({ ok: true });
    unsubscribe();
    expect(sends).toHaveLength(8);
    expect(sends[0]).toContain('需求：feature');
    expect(new Set(coderTurns).size).toBe(3);
    expect(statuses).toEqual([
      `💻 Step 1/8 — ${providerName(DEFAULT_CODING_ROLES.planner)}: Write specification…`,
      `💻 Step 2/8 — ${providerName(DEFAULT_CODING_ROLES.reviewer)}: Review specification…`,
      `💻 Step 3/8 — ${providerName(DEFAULT_CODING_ROLES.coder)}: Write v1…`,
      `💻 Step 4/8 — ${providerName(DEFAULT_CODING_ROLES.reviewer)}: Code review…`,
      `💻 Step 5/8 — ${providerName(DEFAULT_CODING_ROLES.tester)}: Test analysis…`,
      `💻 Step 6/8 — ${providerName(DEFAULT_CODING_ROLES.coder)}: Revise to v2…`,
      `💻 Step 7/8 — ${providerName(DEFAULT_CODING_ROLES.planner)}: Acceptance review…`,
      `💻 Step 8/8 — ${providerName(DEFAULT_CODING_ROLES.coder)}: Final revision…`,
      '',
    ]);
    expect(roleAssignments).toEqual([
      { role: 'planner', label: 'Write specification' },
      { role: 'reviewer', label: 'Review specification' },
      { role: 'coder', label: 'Write v1' },
      { role: 'reviewer', label: 'Code review' },
      { role: 'tester', label: 'Test analysis' },
      { role: 'coder', label: 'Revise to v2' },
      { role: 'planner', label: 'Acceptance review' },
      { role: 'coder', label: 'Final revision' },
    ]);
    expect(sent.map((item) => item.prompt)).toEqual([
      PROMPTS.coding.plannerSpec('feature'),
      PROMPTS.coding.reviewerSpec('feature', responses[0], providerName(DEFAULT_CODING_ROLES.planner)),
      PROMPTS.coding.coderV1(
        'feature',
        responses[0],
        providerName(DEFAULT_CODING_ROLES.planner),
        responses[1],
        providerName(DEFAULT_CODING_ROLES.reviewer),
      ),
      PROMPTS.coding.reviewerCode('feature', responses[2], providerName(DEFAULT_CODING_ROLES.coder)),
      PROMPTS.coding.testerCases('feature', responses[2], providerName(DEFAULT_CODING_ROLES.coder)),
      PROMPTS.coding.coderV2(
        'feature',
        responses[2],
        responses[3],
        providerName(DEFAULT_CODING_ROLES.reviewer),
        responses[4],
        providerName(DEFAULT_CODING_ROLES.tester),
      ),
      PROMPTS.coding.plannerAcceptance('feature', responses[5], providerName(DEFAULT_CODING_ROLES.coder), responses[0]),
      PROMPTS.coding.coderFinal('feature', responses[5], responses[6], providerName(DEFAULT_CODING_ROLES.planner)),
    ]);
  });

  it('emits the distinct terminal system error shape and pins the skip string codepoint', () => {
    const messages: BridgeMessage[] = [];
    const unsubscribe = onBridgeMessage((message: BridgeMessage) => messages.push(message));
    emitSystemError('boom');
    unsubscribe();
    expect(messages[0]).toMatchObject({ action: 'RESPONSE_DONE', provider: 'system', payload: 'Error: boom', transport: 'local' });
    expect(SKIP_RESPONSE).toBe('(no response — skipped)');
    expect(SKIP_RESPONSE.charCodeAt('(no response '.length)).toBe(0x2014);
  });
});
