import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import {
  AI_PROVIDERS,
  BRAINSTORM_ROUND_COUNT,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
  PROMPTS,
} from '../../shared/constants';
import { onBridgeMessage, publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { resetBridgePullForTests } from '../bridge/pull';
import { host } from '../host';
import { resetCancelState } from '../workflow/cancel';
import { brainstormGraph, debateGraph, executeGraph, freeGraph, preflightGraph, validateGraph, type StepNode, type WorkflowGraph } from '../workflow/graph';
import { flushSessionCheckpointForTests, resetSessionCheckpointForTests } from '../workflow/sessionCheckpoint';
import { resetWorkflowStateForTests } from '../workflow/state';
import { resetStepTimeoutForTests } from '../workflow/stepTimeout';
import { resetWaitForResponseForTests } from '../workflow/waitForResponse';

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
    sessionCheckpoint: {
      save: vi.fn(),
      load: vi.fn(),
      clear: vi.fn(),
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

function cloneDebateGraph(): WorkflowGraph {
  return structuredClone(debateGraph) as WorkflowGraph;
}

describe('workflow graph foundation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSessionCheckpointForTests();
    vi.mocked(host.provider.send).mockResolvedValue(undefined);
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
    resetCancelState();
    resetStepTimeoutForTests();
    resetSessionCheckpointForTests();
    vi.clearAllTimers();
    await Promise.resolve();
    vi.useRealTimers();
  });

  it('executes debateGraph with the existing debate observable order and prompt threading', async () => {
    const order: string[] = [];
    const prompts: string[] = [];
    const statuses: string[] = [];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action === 'ROLE_ASSIGNMENT') order.push(`role:${message.provider}`);
      if (message.action === 'WORKFLOW_STATUS' && typeof message.payload === 'string') statuses.push(message.payload);
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      order.push(`send:${provider}`);
      prompts.push(prompt);
      publishBridgeMessage(done(provider, `${provider}-answer`));
    });

    await expect(executeGraph(debateGraph, { text: 'debate question', roles: DEFAULT_DEBATE_ROLES })).resolves.toBeUndefined();

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
    expect(statuses[statuses.length - 1]).toBe('');
  });

  it('executes twelve Brainstorm rounds with four rotating speakers and full prior history', async () => {
    const order: AIProvider[] = [];
    const prompts: string[] = [];
    const roleLabels: string[] = [];
    const unsubscribe = onBridgeMessage((message) => {
      if (message.action !== 'ROLE_ASSIGNMENT') return;
      const label = (message.payload as { label?: unknown } | undefined)?.label;
      if (typeof label === 'string') roleLabels.push(label);
    });
    vi.mocked(host.provider.send).mockImplementation(async (provider, prompt) => {
      const turn = order.length + 1;
      order.push(provider);
      prompts.push(prompt);
      publishBridgeMessage(done(provider, `answer-${turn}`));
    });

    await expect(
      executeGraph(brainstormGraph, {
        text: 'Design a calmer onboarding flow',
        roles: DEFAULT_ROUNDTABLE_ROLES,
        locale: 'en',
      }),
    ).resolves.toBeUndefined();
    unsubscribe();

    const baseOrder = ['claude', 'gemini', 'grok', 'chatgpt'] satisfies AIProvider[];
    const expectedOrder = Array.from({ length: BRAINSTORM_ROUND_COUNT }, (_, roundIndex) =>
      Array.from({ length: baseOrder.length }, (_, speakerIndex) => baseOrder[(roundIndex + speakerIndex) % baseOrder.length]),
    ).flat();
    expect(order).toEqual(expectedOrder);
    expect(host.provider.send).toHaveBeenCalledTimes(48);
    expectedOrder.forEach((provider, index) => {
      const round = Math.floor(index / baseOrder.length) + 1;
      const speakerPosition = (index % baseOrder.length) + 1;
      const history = expectedOrder.slice(0, index).map((priorProvider, priorIndex) => ({
        name: AI_PROVIDERS[priorProvider].name,
        round: Math.floor(priorIndex / baseOrder.length) + 1,
        text: `answer-${priorIndex + 1}`,
      }));
      expect(prompts[index]).toBe(
        PROMPTS.brainstorm.buildPrompt('Design a calmer onboarding flow', round, speakerPosition, provider, history),
      );
    });
    expect(roleLabels).toEqual(
      Array.from({ length: BRAINSTORM_ROUND_COUNT * baseOrder.length }, (_, index) =>
        `Brainstorm round ${Math.floor(index / baseOrder.length) + 1}`,
      ),
    );
  });

  it('requires all four distinct Brainstorm collaborators before starting', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([state('chatgpt'), state('claude'), state('gemini'), state('grok', false)]);

    await expect(preflightGraph(brainstormGraph, DEFAULT_ROUNDTABLE_ROLES)).resolves.toMatchObject({
      ok: false,
      unavailable: ['grok'],
      aliased: [],
    });
  });

  it('preflights serial graphs with the existing sendable predicate', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([state('chatgpt'), state('claude', false), state('gemini'), state('grok')]);
    await expect(preflightGraph(debateGraph, DEFAULT_DEBATE_ROLES)).resolves.toMatchObject({
      ok: false,
      unavailable: ['claude'],
      aliased: [],
    });
  });

  it('rejects unknown prompt builders and unresolved output refs', () => {
    const graph = cloneDebateGraph();
    (graph.nodes.pro as StepNode).prompt.builder = 'missing.builder';
    ((graph.nodes.con as StepNode).prompt.args[1] as { kind: 'output'; node: string }).node = 'missing-node';

    const errors = validateGraph(graph);
    expect(errors.some((error) => error.code === 'unknown-builder')).toBe(true);
    expect(errors.some((error) => error.code === 'unresolved-ref' && error.message.includes('missing-node'))).toBe(true);
  });

  it('rejects unbounded loops and dynamic selectors without possibleRoles', () => {
    const graph = cloneDebateGraph();
    (graph.nodes.pro as StepNode).provider = {
      type: 'select',
      cases: [{ role: 'pro' }],
      possibleRoles: [],
    };
    graph.nodes.loop = {
      kind: 'loop',
      loopId: 'retry',
      maxIterations: 0,
      bodyStart: 'pro',
      after: 'summary',
    };

    const errors = validateGraph(graph);
    expect(errors.some((error) => error.code === 'dynamic-selector-missing-possible-roles')).toBe(true);
    expect(errors.some((error) => error.code === 'unbounded-loop')).toBe(true);
  });

  it('rejects parallel groups that can resolve to the same provider', () => {
    const graph = cloneDebateGraph();
    (graph.nodes.pro as StepNode).parallelGroup = 'collision';
    graph.nodes.proTwin = {
      ...(graph.nodes.pro as StepNode),
      output: 'proTwinResponse',
      parallelGroup: 'collision',
    };

    const errors = validateGraph(graph);
    expect(errors.some((error) => error.code === 'parallel-provider-collision')).toBe(true);
  });

  it('accepts checkpoint metadata only on serial step nodes', () => {
    const serial = cloneDebateGraph();
    (serial.nodes.pro as StepNode).checkpoint = { policy: 'draft-confirm' };
    expect(validateGraph(serial).filter((error) => error.code === 'invalid-checkpoint')).toEqual([]);

    const parallel = cloneDebateGraph();
    (parallel.nodes.pro as StepNode).checkpoint = { policy: 'draft-confirm' };
    (parallel.nodes.pro as StepNode).parallelGroup = 'initial';
    const parallelErrors = validateGraph(parallel);
    expect(parallelErrors.some((error) => error.code === 'invalid-checkpoint' && error.path === 'nodes.pro.checkpoint')).toBe(true);

    const fanout = structuredClone(freeGraph) as WorkflowGraph;
    const fanoutNode = fanout.nodes.fanout;
    if (fanoutNode.kind !== 'fanout') throw new Error('Expected free graph fanout node');
    fanoutNode.template.checkpoint = { policy: 'draft-confirm' };
    const fanoutErrors = validateGraph(fanout);
    expect(fanoutErrors.some((error) => error.code === 'invalid-checkpoint' && error.path === 'nodes.fanout.template.checkpoint')).toBe(true);
  });
});
