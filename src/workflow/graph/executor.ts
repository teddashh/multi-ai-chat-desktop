import { AI_PROVIDERS, CHAT_MODES } from '../../../shared/constants';
import type { AIProvider, ChatMode } from '../../../shared/types';
import { checkAborted } from '../cancel';
import { awaitCheckpoint } from '../checkpoint';
import { sendRoleAssignment, sendWorkflowStatus } from '../events';
import { reserveProviderTurn, sendAndWait } from '../sendAndWait';
import { runStep } from '../stepRunner';
import { clearActiveTurn, SKIP_RESPONSE } from '../state';
import { getSnapshotAdapterVersions } from '../snapshot/adapterVersions';
import { beginSnapshot, completeSnapshot, recordHumanEdit, recordStep } from '../snapshot/recorder';
import type { AIProviderV2, ExecutionSnapshot, ExecutionSnapshotStep } from '../snapshot/types';
import {
  beginSessionCheckpoint,
  clearSessionCheckpoint,
  updateSessionCheckpoint,
} from '../sessionCheckpoint';
import { evaluateTextCondition, renderRegisteredPrompt } from './registries';
import { resolveGraphRoles } from './preflight';
import { assertValidGraph } from './validator';
import type {
  ExecuteGraphParams,
  FanoutNode,
  GraphNode,
  HistoryItem,
  LoopNode,
  NodeId,
  PromptArg,
  PromptSpec,
  ProviderRef,
  StepNode,
  StepOutput,
  TextCondition,
  TextRef,
  TextTemplate,
  WorkflowGraph,
} from './types';

interface ExecutionContext {
  graph: WorkflowGraph;
  question: string;
  roles: Map<string, AIProvider>;
  targets: AIProvider[];
  outputs: Map<NodeId, StepOutput>;
  aggregates: Map<string, string>;
  histories: Map<string, HistoryItem[]>;
  loopValues: Map<string, unknown>;
  loopIterations: Map<string, number>;
  checkpoints: boolean;
  completed: Set<NodeId>;
  ready: Set<NodeId>;
  evaluatedEdges: Set<number>;
  satisfiedEdges: Set<number>;
  nodeOrder: NodeId[];
}

interface PreparedNode {
  nodeId: NodeId;
  run: () => Promise<NodeRunResult>;
}

interface NodeRunResult {
  nodeId: NodeId;
  output?: StepOutput;
  aggregate?: { name: string; text: string };
  appendHistory?: { name: string; item: HistoryItem };
  enqueue?: NodeId[];
}

type RenderedPromptArg = string | number | HistoryItem[] | undefined;

export interface ExecuteGraphOptions {
  onSnapshotComplete?: (snapshot: ExecutionSnapshot) => void | Promise<void>;
}

export async function executeGraph(graph: WorkflowGraph, params: ExecuteGraphParams, options: ExecuteGraphOptions = {}): Promise<void> {
  assertValidGraph(graph);
  const context = createExecutionContext(graph, params);
  beginSessionCheckpoint({
    graphId: graph.id,
    graphVersion: graph.version ?? 1,
    mode: checkpointMode(graph),
    question: context.question,
  });
  beginSnapshot({
    graph,
    question: context.question,
    roleMap: snapshotRoleMap(context),
    adapterVersions: snapshotAdapterVersions(context),
  });
  const abortAware = graph.preflight.kind !== 'free';
  let completedCleanly = false;
  try {
    addReady(context, graph.start);
    addParallelSiblings(context, graph.start);

    for (;;) {
      const batch = takeReadyBatch(context);
      if (batch.length === 0) break;
      // Abort point matches the old imperative handlers: checked before each step that
      // actually runs, never after the final step (placing it after the empty-batch break
      // guard avoids a post-terminal-step check that the old handlers did not have).
      if (abortAware) checkAborted();

      const status = renderBatchStatus(batch, context);
      if (status !== undefined) sendWorkflowStatus(status);

      const prepared = batch.map((nodeId) => prepareNode(nodeId, context));
      const results = await Promise.all(prepared.map((item) => item.run()));
      results.forEach((result) => applyNodeResult(context, result));
      updateSessionCheckpoint({ stepIndex: context.completed.size });

      evaluateEdges(context);
    }

    if (graph.onComplete?.status !== undefined) sendWorkflowStatus(graph.onComplete.status);
    else sendWorkflowStatus('');
    completedCleanly = true;
  } finally {
    const snapshot = completeSnapshot();
    if (snapshot) {
      try {
        await options.onSnapshotComplete?.(snapshot);
      } catch {
        // Snapshot persistence is best-effort (SPEC §13).
      }
    }
    if (completedCleanly) clearSessionCheckpoint();
  }
}

function createExecutionContext(graph: WorkflowGraph, params: ExecuteGraphParams): ExecutionContext {
  return {
    graph,
    question: params.text,
    roles: resolveGraphRoles(graph, params.roles),
    targets: params.targets ?? [],
    outputs: new Map(),
    aggregates: new Map(),
    histories: new Map(),
    loopValues: new Map(),
    loopIterations: new Map(),
    checkpoints: params.checkpoints === true,
    completed: new Set(),
    ready: new Set(),
    evaluatedEdges: new Set(),
    satisfiedEdges: new Set(),
    nodeOrder: Object.keys(graph.nodes),
  };
}

function takeReadyBatch(context: ExecutionContext): NodeId[] {
  const orderedReady = context.nodeOrder.filter((nodeId) => context.ready.has(nodeId));
  const first = orderedReady[0];
  if (!first) return [];
  const firstNode = context.graph.nodes[first];
  const group = firstNode.kind === 'step' ? firstNode.parallelGroup : undefined;
  const batch = group
    ? orderedReady.filter((nodeId) => {
        const node = context.graph.nodes[nodeId];
        return node.kind === 'step' && node.parallelGroup === group;
      })
    : [first];
  batch.forEach((nodeId) => context.ready.delete(nodeId));
  return batch;
}

function addReady(context: ExecutionContext, nodeId: NodeId): void {
  if (context.completed.has(nodeId)) return;
  if (!(nodeId in context.graph.nodes)) return;
  context.ready.add(nodeId);
}

function addParallelSiblings(context: ExecutionContext, nodeId: NodeId): void {
  const node = context.graph.nodes[nodeId];
  if (node.kind !== 'step' || !node.parallelGroup) return;
  context.nodeOrder.forEach((candidateId) => {
    const candidate = context.graph.nodes[candidateId];
    if (candidate.kind === 'step' && candidate.parallelGroup === node.parallelGroup && incomingEdges(context, candidateId).length === 0) {
      addReady(context, candidateId);
    }
  });
}

function prepareNode(nodeId: NodeId, context: ExecutionContext): PreparedNode {
  const node = context.graph.nodes[nodeId];
  if (node.kind === 'step') return prepareStepNode(nodeId, node, context);
  if (node.kind === 'fanout') return prepareFanoutNode(nodeId, node, context);
  if (node.kind === 'aggregate') {
    return { nodeId, run: async () => executeAggregateNode(nodeId, node, context) };
  }
  if (node.kind === 'loop') return { nodeId, run: async () => executeLoopNode(nodeId, node, context) };
  return { nodeId, run: async () => ({ nodeId, output: { text: '' } }) };
}

function prepareStepNode(
  nodeId: NodeId,
  node: StepNode,
  context: ExecutionContext,
  options: { fanoutChild?: boolean } = {},
): PreparedNode {
  const provider = resolveProviderRef(node.provider, context);
  const prompt = renderPromptSpec(node.prompt, context, nodeId, provider);
  if (node.policy === 'freeSendAndWait') {
    return {
      nodeId,
      run: async () => {
        const startedAt = snapshotTimestamp();
        let sendError: unknown;
        const result = await sendAndWait(provider, prompt).catch((error: unknown) => {
          sendError = error;
          return undefined;
        });
        const output = result?.response ?? (sendError ? snapshotErrorText(sendError) : '');
        recordStep({
          nodeId,
          provider,
          input: prompt,
          output,
          status: sendError ? 'error' : snapshotStepStatus(output),
          startedAt,
          completedAt: snapshotTimestamp(),
        });
        return { nodeId, output: { text: result?.response ?? '', provider, turn: result?.turn } };
      },
    };
  }

  const turn = reserveProviderTurn(provider);
  const role = node.role ? renderTextTemplate(node.role, context, nodeId, provider) : undefined;
  const label = node.label ? renderTextTemplate(node.label, context, nodeId, provider) : role;
  if (role) sendRoleAssignment(provider, role, label ?? role, turn);

  return {
    nodeId,
    run: async () => {
      const startedAt = snapshotTimestamp();
      let input = prompt;
      try {
        if (isCheckpointedSerialStep(node, context, options)) {
          const sourceNodeId = checkpointSourceNodeId(nodeId, context);
          updateSessionCheckpoint({ pendingCheckpointNodeId: nodeId });
          const decision = await awaitCheckpoint({ nodeId, sourceNodeId, provider, draft: prompt });
          updateSessionCheckpoint({ pendingCheckpointNodeId: null });
          checkAborted();
          if (decision.action === 'skip') {
            clearActiveTurn(provider, turn);
            recordStep({
              nodeId,
              provider,
              input,
              output: SKIP_RESPONSE,
              status: 'skipped',
              startedAt,
              completedAt: snapshotTimestamp(),
            });
            return {
              nodeId,
              output: { text: SKIP_RESPONSE, provider, turn: -1 },
              appendHistory: renderHistoryAppend(node, context, SKIP_RESPONSE, provider),
            };
          }
          input = decision.draft;
          if (input !== prompt) {
            recordHumanEdit({
              checkpointId: nodeId,
              sourceNodeId,
              targetNodeId: nodeId,
              before: prompt,
              after: input,
            });
          }
        }

        const result = await runStep(provider, input, turn);
        recordStep({
          nodeId,
          provider,
          input,
          output: result.response,
          status: snapshotStepStatus(result.response),
          startedAt,
          completedAt: snapshotTimestamp(),
        });
        return {
          nodeId,
          output: { text: result.response, provider, turn: result.turn },
          appendHistory: renderHistoryAppend(node, context, result.response, provider),
        };
      } catch (error) {
        clearActiveTurn(provider, turn);
        recordStep({
          nodeId,
          provider,
          input,
          output: snapshotErrorText(error),
          status: 'error',
          startedAt,
          completedAt: snapshotTimestamp(),
        });
        throw error;
      }
    },
  };
}

function prepareFanoutNode(nodeId: NodeId, node: FanoutNode, context: ExecutionContext): PreparedNode {
  const providers = resolveFanoutProviders(node, context);
  const prepared = providers.map((provider, index) => {
    const childContext = cloneContextWithLoopValue(context, node.template.provider, provider);
    return prepareStepNode(
      `${nodeId}:${index}`,
      { ...node.template, kind: 'step', provider: { type: 'provider', provider } },
      childContext,
      { fanoutChild: true },
    );
  });

  return {
    nodeId,
    run: async () => {
      const settled = await Promise.all(
        prepared.map((item) =>
          item.run().catch((error: unknown) => {
            if (node.errorPolicy === 'swallow') return { nodeId: item.nodeId, output: { text: '' } };
            throw error;
          }),
        ),
      );
      const text = settled.map((result) => result.output?.text ?? '').join('\n');
      return { nodeId, output: { text }, aggregate: { name: node.output, text } };
    },
  };
}

function executeAggregateNode(nodeId: NodeId, node: Extract<GraphNode, { kind: 'aggregate' }>, context: ExecutionContext): NodeRunResult {
  let text = '';
  if (node.strategy.type === 'joinText') {
    text = node.strategy.inputs.map((input) => resolveTextRef(input, context)).join(node.strategy.separator);
  } else if (node.strategy.type === 'vote') {
    text = executeVoteAggregate(node, context);
  } else {
    const matched = node.strategy.cases.find((item) => evaluateCondition(item.when, context));
    text = resolveTextRef(matched?.value ?? node.strategy.fallback, context);
  }
  return { nodeId, output: { text }, aggregate: { name: node.output, text } };
}

function executeVoteAggregate(node: Extract<GraphNode, { kind: 'aggregate' }>, context: ExecutionContext): string {
  if (node.strategy.type !== 'vote') return '';
  const regex = new RegExp(node.strategy.ballotRegex, 'm');
  const choices = new Map<string, number>();
  node.strategy.ballots.forEach((ballot) => {
    const match = regex.exec(resolveTextRef(ballot, context));
    const choice = match?.groups?.choice ?? match?.[1];
    if (choice) choices.set(choice, (choices.get(choice) ?? 0) + 1);
  });
  const ranked = [...choices.entries()].sort((left, right) => right[1] - left[1]);
  const winner = ranked[0];
  if (!winner) return '';
  if (node.strategy.quorum && winner[1] < node.strategy.quorum) throw new Error(`Vote aggregate "${node.output}" did not reach quorum`);
  return winner[0];
}

function executeLoopNode(nodeId: NodeId, node: LoopNode, context: ExecutionContext): NodeRunResult {
  const current = context.loopIterations.get(node.loopId) ?? 0;
  if (current === 0 && node.init) {
    Object.entries(node.init).forEach(([name, value]) => context.loopValues.set(name, value));
  }
  if (current >= node.maxIterations) return { nodeId, enqueue: [node.after], output: { text: '' } };
  if (node.terminateWhen && evaluateCondition(node.terminateWhen, context)) return { nodeId, enqueue: [node.after], output: { text: '' } };
  if (node.continueWhen && !evaluateCondition(node.continueWhen, context)) return { nodeId, enqueue: [node.after], output: { text: '' } };

  const nextIteration = current + 1;
  context.loopIterations.set(node.loopId, nextIteration);
  context.loopValues.set(node.loopId, nextIteration);
  return { nodeId, enqueue: [node.bodyStart], output: { text: String(nextIteration) } };
}

function applyNodeResult(context: ExecutionContext, result: NodeRunResult): void {
  context.completed.add(result.nodeId);
  if (result.output) context.outputs.set(result.nodeId, result.output);
  if (result.aggregate) context.aggregates.set(result.aggregate.name, result.aggregate.text);
  if (result.appendHistory) {
    const history = context.histories.get(result.appendHistory.name) ?? [];
    history.push(result.appendHistory.item);
    context.histories.set(result.appendHistory.name, history);
  }
  result.enqueue?.forEach((nodeId) => addReady(context, nodeId));
}

function evaluateEdges(context: ExecutionContext): void {
  context.graph.edges.forEach((edge, index) => {
    if (context.evaluatedEdges.has(index)) return;
    const fromNodes = Array.isArray(edge.from) ? edge.from : [edge.from];
    if (!fromNodes.every((nodeId) => context.completed.has(nodeId))) return;
    context.evaluatedEdges.add(index);
    if (!edge.when || evaluateCondition(edge.when, context)) context.satisfiedEdges.add(index);
  });

  context.nodeOrder.forEach((nodeId) => {
    if (context.completed.has(nodeId) || context.ready.has(nodeId)) return;
    const incoming = incomingEdges(context, nodeId);
    if (incoming.length === 0) return;
    if (!incoming.every((index) => context.satisfiedEdges.has(index))) return;
    addReady(context, nodeId);
    addParallelSiblings(context, nodeId);
  });
}

function incomingEdges(context: ExecutionContext, nodeId: NodeId): number[] {
  return context.graph.edges.flatMap((edge, index) => (edge.to === nodeId ? [index] : []));
}

function renderBatchStatus(batch: NodeId[], context: ExecutionContext): string | undefined {
  for (const nodeId of batch) {
    const node = context.graph.nodes[nodeId];
    const status = node.kind === 'step' || node.kind === 'noop' ? node.status : node.kind === 'fanout' ? node.template.status : undefined;
    if (!status) continue;
    if (node.kind === 'fanout' && node.over.type === 'targets' && resolveFanoutProviders(node, context).length === 0) return undefined;
    const provider = node.kind === 'step' ? resolveProviderRef(node.provider, context) : undefined;
    return renderTextTemplate(status, context, nodeId, provider);
  }
  return undefined;
}

function renderPromptSpec(prompt: PromptSpec, context: ExecutionContext, nodeId: NodeId, provider?: AIProvider): string {
  const args = prompt.args.map((promptArg) => renderPromptArg(promptArg, context));
  return renderRegisteredPrompt(prompt, args, { graph: context.graph, nodeId, provider, targets: context.targets });
}

function renderTextTemplate(template: TextTemplate, context: ExecutionContext, nodeId: NodeId, provider?: AIProvider): string {
  if (typeof template === 'string') return template;
  const args = (template.args ?? []).map((promptArg) => renderPromptArg(promptArg, context));
  return renderRegisteredPrompt({ builder: template.builder, args: template.args ?? [] }, args, {
    graph: context.graph,
    nodeId,
    provider,
    targets: context.targets,
  });
}

function renderPromptArg(promptArg: PromptArg, context: ExecutionContext): RenderedPromptArg {
  if (promptArg.kind === 'input') return context.question;
  if (promptArg.kind === 'output') return context.outputs.get(promptArg.node)?.text ?? '';
  if (promptArg.kind === 'aggregate') return context.aggregates.get(promptArg.name) ?? '';
  if (promptArg.kind === 'providerName') return AI_PROVIDERS[resolveProviderRef(promptArg.provider, context)].name;
  if (promptArg.kind === 'history') return context.histories.get(promptArg.name) ?? [];
  if (promptArg.kind === 'literal') return promptArg.value;
  return String(context.loopValues.get(promptArg.name) ?? '');
}

function resolveTextRef(ref: TextRef, context: ExecutionContext): string {
  if (ref.kind === 'input') return context.question;
  if (ref.kind === 'output') return context.outputs.get(ref.node)?.text ?? '';
  if (ref.kind === 'aggregate') return context.aggregates.get(ref.name) ?? '';
  if (ref.kind === 'historyText') return renderHistory(context.histories.get(ref.name) ?? []);
  return ref.text;
}

function evaluateCondition(condition: TextCondition, context: ExecutionContext): boolean {
  return evaluateTextCondition(condition, { resolveTextRef: (ref) => resolveTextRef(ref, context) });
}

function resolveProviderRef(ref: ProviderRef, context: ExecutionContext): AIProvider {
  if (ref.type === 'provider') return ref.provider;
  if (ref.type === 'role') {
    const provider = context.roles.get(ref.role);
    if (!provider) throw new Error(`No provider configured for graph role "${ref.role}"`);
    return provider;
  }
  if (ref.type === 'target') {
    const provider = context.loopValues.get('target');
    if (isAIProvider(provider)) return provider;
    if (context.targets[0]) return context.targets[0];
    throw new Error('No graph target provider is available');
  }
  if (ref.type === 'loopVar') return resolveLoopProvider(ref.name, context);
  const selected = ref.cases.find((item) => !item.when || evaluateCondition(item.when, context));
  if (!selected) throw new Error('Dynamic provider selector had no matching case');
  return resolveProviderRef({ type: 'role', role: selected.role }, context);
}

function resolveLoopProvider(name: string, context: ExecutionContext): AIProvider {
  const value = context.loopValues.get(name);
  if (isAIProvider(value)) return value;
  if (isProviderRef(value)) return resolveProviderRef(value, context);
  if (typeof value === 'string' && context.roles.has(value)) return resolveProviderRef({ type: 'role', role: value }, context);
  throw new Error(`Loop variable "${name}" does not contain a provider`);
}

function resolveFanoutProviders(node: FanoutNode, context: ExecutionContext): AIProvider[] {
  if (node.over.type === 'targets') return context.targets;
  if (node.over.type === 'roles') return node.over.roles.map((role) => resolveProviderRef({ type: 'role', role }, context));
  const value = context.loopValues.get(node.over.ref);
  return Array.isArray(value) ? value.filter(isAIProvider) : [];
}

function cloneContextWithLoopValue(context: ExecutionContext, providerRef: ProviderRef, provider: AIProvider): ExecutionContext {
  if (providerRef.type !== 'loopVar') return context;
  return { ...context, loopValues: new Map([...context.loopValues, [providerRef.name, provider]]) };
}

function isCheckpointedSerialStep(node: StepNode, context: ExecutionContext, options: { fanoutChild?: boolean }): boolean {
  const enabled = context.checkpoints || node.checkpoint?.policy === 'draft-confirm';
  return enabled && node.policy === 'serialRunStep' && !node.parallelGroup && options.fanoutChild !== true;
}

function checkpointSourceNodeId(nodeId: NodeId, context: ExecutionContext): NodeId {
  const predecessors = context.graph.edges.flatMap((edge) => {
    if (edge.to !== nodeId) return [];
    return Array.isArray(edge.from) ? edge.from : [edge.from];
  });
  const completedPredecessors = predecessors.filter((predecessor) => context.completed.has(predecessor));
  return completedPredecessors[completedPredecessors.length - 1] ?? nodeId;
}

function renderHistoryAppend(
  node: StepNode,
  context: ExecutionContext,
  selfOutput: string,
  selfProvider: AIProvider,
): { name: string; item: HistoryItem } | undefined {
  if (!node.appendHistory) return undefined;
  const name = node.appendHistory.value.name
    ? AI_PROVIDERS[resolveProviderRef(node.appendHistory.value.name.provider, context)].name
    : AI_PROVIDERS[selfProvider].name;
  const roundValue = node.appendHistory.value.round
    ? node.appendHistory.value.round.kind === 'literal'
      ? node.appendHistory.value.round.value
      : context.loopValues.get(node.appendHistory.value.round.name)
    : undefined;
  const text =
    node.appendHistory.value.text.kind === 'selfOutput'
      ? selfOutput
      : context.outputs.get(node.appendHistory.value.text.node)?.text ?? '';
  return {
    name: node.appendHistory.history,
    item: {
      name,
      round: typeof roundValue === 'number' ? roundValue : undefined,
      text,
    },
  };
}

function renderHistory(history: HistoryItem[]): string {
  return history
    .map((item) => {
      const heading = item.round && item.name ? `第${item.round}輪・${item.name}` : item.name ?? '';
      return heading ? `【${heading}】\n${item.text}` : item.text;
    })
    .join('\n\n---\n\n');
}

function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && value in AI_PROVIDERS;
}

function isProviderRef(value: unknown): value is ProviderRef {
  return Boolean(value && typeof value === 'object' && 'type' in value);
}

function snapshotRoleMap(context: ExecutionContext): Record<string, AIProviderV2> {
  const roleMap: Record<string, AIProviderV2> = {};
  context.roles.forEach((provider, role) => {
    roleMap[role] = provider;
  });
  return roleMap;
}

function snapshotAdapterVersions(context: ExecutionContext): Partial<Record<AIProviderV2, number>> {
  return getSnapshotAdapterVersions(snapshotRunProviders(context));
}

function snapshotRunProviders(context: ExecutionContext): AIProviderV2[] {
  return [...new Set<AIProviderV2>([...context.roles.values(), ...context.targets])];
}

function checkpointMode(graph: WorkflowGraph): ChatMode {
  if (graph.mode && graph.mode in CHAT_MODES) return graph.mode;
  if (graph.id in CHAT_MODES) return graph.id as ChatMode;
  return 'free';
}

function snapshotTimestamp(): string {
  return new Date().toISOString();
}

function snapshotStepStatus(output: string): ExecutionSnapshotStep['status'] {
  if (output === SKIP_RESPONSE) return 'skipped';
  if (errorLikeResponse(output)) return 'error';
  return 'done';
}

function errorLikeResponse(text: string): boolean {
  return /^\[Error:\s*[\s\S]*?\]$/.test(text) || text.startsWith('Error:');
}

function snapshotErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `[Error: ${message}]`;
}
