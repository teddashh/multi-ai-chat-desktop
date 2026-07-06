import { AI_PROVIDERS } from '../../../shared/constants';
import type { AIProvider } from '../../../shared/types';
import { hasPromptBuilder, hasTextConditionEvaluator } from './registries';
import type {
  AggregateNode,
  FanoutNode,
  GraphEdge,
  GraphNode,
  HistoryAppendSpec,
  LoopNode,
  NodeId,
  PromptArg,
  PromptSpec,
  ProviderRef,
  RoleKey,
  StepNode,
  TextCondition,
  TextRef,
  TextTemplate,
  WorkflowGraph,
} from './types';

export interface GraphValidationError {
  code:
    | 'unknown-builder'
    | 'unknown-condition'
    | 'unresolved-ref'
    | 'unbounded-loop'
    | 'parallel-provider-collision'
    | 'dynamic-selector-missing-possible-roles';
  message: string;
  path: string;
}

interface ValidationContext {
  graph: WorkflowGraph;
  errors: GraphValidationError[];
  nodeIds: Set<NodeId>;
  aggregateNames: Set<string>;
  loopIds: Set<string>;
}

export function validateGraph(graph: WorkflowGraph): GraphValidationError[] {
  const context: ValidationContext = {
    graph,
    errors: [],
    nodeIds: new Set(Object.keys(graph.nodes)),
    aggregateNames: collectAggregateNames(graph),
    loopIds: collectLoopIds(graph),
  };

  if (!context.nodeIds.has(graph.start)) {
    addError(context, 'unresolved-ref', `Start node "${graph.start}" does not exist`, 'start');
  }

  Object.entries(graph.nodes).forEach(([nodeId, node]) => validateNode(context, nodeId, node));
  graph.edges.forEach((edge, index) => validateEdge(context, edge, index));
  validateParallelGroups(context);

  return context.errors;
}

export function assertValidGraph(graph: WorkflowGraph): void {
  const errors = validateGraph(graph);
  if (errors.length === 0) return;
  throw new Error(errors.map((error) => `${error.path}: ${error.message}`).join('\n'));
}

function validateNode(context: ValidationContext, nodeId: string, node: GraphNode): void {
  if (node.kind === 'step') {
    validateStepNode(context, nodeId, node);
    return;
  }
  if (node.kind === 'fanout') {
    validateFanoutNode(context, nodeId, node);
    return;
  }
  if (node.kind === 'aggregate') {
    validateAggregateNode(context, nodeId, node);
    return;
  }
  if (node.kind === 'loop') {
    validateLoopNode(context, nodeId, node);
    return;
  }
  validateTextTemplate(context, node.status, `nodes.${nodeId}.status`);
}

function validateStepNode(context: ValidationContext, nodeId: string, node: StepNode): void {
  validateProviderRef(context, node.provider, `nodes.${nodeId}.provider`);
  validateTextTemplate(context, node.role, `nodes.${nodeId}.role`);
  validateTextTemplate(context, node.label, `nodes.${nodeId}.label`);
  validateTextTemplate(context, node.status, `nodes.${nodeId}.status`);
  validatePromptSpec(context, node.prompt, `nodes.${nodeId}.prompt`);
  validateHistoryAppend(context, node.appendHistory, `nodes.${nodeId}.appendHistory`);
}

function validateFanoutNode(context: ValidationContext, nodeId: string, node: FanoutNode): void {
  if (node.over.type === 'roles') {
    node.over.roles.forEach((role, index) => {
      if (!(role in context.graph.roles)) {
        addError(context, 'unresolved-ref', `Fanout role "${role}" does not exist`, `nodes.${nodeId}.over.roles.${index}`);
      }
    });
  }
  validateProviderRef(context, node.template.provider, `nodes.${nodeId}.template.provider`);
  validateTextTemplate(context, node.template.role, `nodes.${nodeId}.template.role`);
  validateTextTemplate(context, node.template.label, `nodes.${nodeId}.template.label`);
  validateTextTemplate(context, node.template.status, `nodes.${nodeId}.template.status`);
  validatePromptSpec(context, node.template.prompt, `nodes.${nodeId}.template.prompt`);
  validateHistoryAppend(context, node.template.appendHistory, `nodes.${nodeId}.template.appendHistory`);
}

function validateAggregateNode(context: ValidationContext, nodeId: string, node: AggregateNode): void {
  if (node.strategy.type === 'joinText') {
    node.strategy.inputs.forEach((input, index) => validateTextRef(context, input, `nodes.${nodeId}.strategy.inputs.${index}`));
    return;
  }
  if (node.strategy.type === 'vote') {
    node.strategy.ballots.forEach((ballot, index) => validateTextRef(context, ballot, `nodes.${nodeId}.strategy.ballots.${index}`));
    return;
  }
  node.strategy.cases.forEach((item, index) => {
    validateTextCondition(context, item.when, `nodes.${nodeId}.strategy.cases.${index}.when`);
    validateTextRef(context, item.value, `nodes.${nodeId}.strategy.cases.${index}.value`);
  });
  validateTextRef(context, node.strategy.fallback, `nodes.${nodeId}.strategy.fallback`);
}

function validateLoopNode(context: ValidationContext, nodeId: string, node: LoopNode): void {
  if (!Number.isInteger(node.maxIterations) || node.maxIterations <= 0) {
    addError(context, 'unbounded-loop', `Loop "${node.loopId}" must have a positive maxIterations`, `nodes.${nodeId}.maxIterations`);
  }
  if (!context.nodeIds.has(node.bodyStart)) {
    addError(context, 'unresolved-ref', `Loop bodyStart "${node.bodyStart}" does not exist`, `nodes.${nodeId}.bodyStart`);
  }
  if (!context.nodeIds.has(node.after)) {
    addError(context, 'unresolved-ref', `Loop after "${node.after}" does not exist`, `nodes.${nodeId}.after`);
  }
  validateConditionIfPresent(context, node.continueWhen, `nodes.${nodeId}.continueWhen`);
  validateConditionIfPresent(context, node.terminateWhen, `nodes.${nodeId}.terminateWhen`);
}

function validateEdge(context: ValidationContext, edge: GraphEdge, index: number): void {
  const fromNodes = Array.isArray(edge.from) ? edge.from : [edge.from];
  fromNodes.forEach((from, fromIndex) => {
    if (!context.nodeIds.has(from)) {
      addError(context, 'unresolved-ref', `Edge source "${from}" does not exist`, `edges.${index}.from.${fromIndex}`);
    }
  });
  if (!context.nodeIds.has(edge.to)) {
    addError(context, 'unresolved-ref', `Edge target "${edge.to}" does not exist`, `edges.${index}.to`);
  }
  validateConditionIfPresent(context, edge.when, `edges.${index}.when`);
}

function validatePromptSpec(context: ValidationContext, prompt: PromptSpec, path: string): void {
  if (!hasPromptBuilder(prompt.builder)) {
    addError(context, 'unknown-builder', `Prompt builder "${prompt.builder}" is not registered`, `${path}.builder`);
  }
  prompt.args.forEach((arg, index) => validatePromptArg(context, arg, `${path}.args.${index}`));
}

function validateTextTemplate(context: ValidationContext, template: TextTemplate | undefined, path: string): void {
  if (!template || typeof template === 'string') return;
  if (!hasPromptBuilder(template.builder)) {
    addError(context, 'unknown-builder', `Prompt builder "${template.builder}" is not registered`, `${path}.builder`);
  }
  (template.args ?? []).forEach((arg, index) => validatePromptArg(context, arg, `${path}.args.${index}`));
}

function validatePromptArg(context: ValidationContext, promptArg: PromptArg, path: string): void {
  if (promptArg.kind === 'output') {
    validateNodeRef(context, promptArg.node, path);
    return;
  }
  if (promptArg.kind === 'aggregate') {
    validateAggregateRef(context, promptArg.name, path);
    return;
  }
  if (promptArg.kind === 'providerName') {
    validateProviderRef(context, promptArg.provider, `${path}.provider`);
    return;
  }
  if (promptArg.kind === 'loop' && !context.loopIds.has(promptArg.name)) {
    addError(context, 'unresolved-ref', `Loop "${promptArg.name}" does not exist`, path);
  }
}

function validateHistoryAppend(context: ValidationContext, appendHistory: HistoryAppendSpec | undefined, path: string): void {
  if (!appendHistory) return;
  if (appendHistory.value.name) validateProviderRef(context, appendHistory.value.name.provider, `${path}.value.name.provider`);
  if (appendHistory.value.round?.kind === 'loop' && !context.loopIds.has(appendHistory.value.round.name)) {
    addError(context, 'unresolved-ref', `Loop "${appendHistory.value.round.name}" does not exist`, `${path}.value.round`);
  }
  if (appendHistory.value.text.kind === 'output') validateNodeRef(context, appendHistory.value.text.node, `${path}.value.text`);
}

function validateProviderRef(context: ValidationContext, ref: ProviderRef, path: string): void {
  if (ref.type === 'role') {
    if (!(ref.role in context.graph.roles)) {
      addError(context, 'unresolved-ref', `Role "${ref.role}" does not exist`, path);
    }
    return;
  }
  if (ref.type === 'provider') {
    if (!isAIProvider(ref.provider)) addError(context, 'unresolved-ref', `Provider "${ref.provider}" does not exist`, path);
    return;
  }
  if (ref.type !== 'select') return;
  if (!Array.isArray(ref.possibleRoles) || ref.possibleRoles.length === 0) {
    addError(
      context,
      'dynamic-selector-missing-possible-roles',
      'Dynamic provider selectors must declare possibleRoles',
      `${path}.possibleRoles`,
    );
  }
  ref.possibleRoles?.forEach((role, index) => {
    if (!(role in context.graph.roles)) {
      addError(context, 'unresolved-ref', `Selector possibleRole "${role}" does not exist`, `${path}.possibleRoles.${index}`);
    }
  });
  ref.cases.forEach((item, index) => {
    if (!(item.role in context.graph.roles)) {
      addError(context, 'unresolved-ref', `Selector role "${item.role}" does not exist`, `${path}.cases.${index}.role`);
    }
    validateConditionIfPresent(context, item.when, `${path}.cases.${index}.when`);
  });
}

function validateTextCondition(context: ValidationContext, condition: TextCondition, path: string): void {
  const typed = condition as { type?: string };
  if (typeof typed.type !== 'string' || !hasTextConditionEvaluator(typed.type)) {
    addError(context, 'unknown-condition', `Text condition "${String(typed.type)}" is not registered`, path);
    return;
  }
  if (condition.type === 'textIncludes' || condition.type === 'regex') {
    validateTextRef(context, condition.ref, `${path}.ref`);
    return;
  }
  if (condition.type === 'equals' || condition.type === 'similarityAtLeast') {
    validateTextRef(context, condition.left, `${path}.left`);
    validateTextRef(context, condition.right, `${path}.right`);
    return;
  }
  if (condition.type === 'all' || condition.type === 'any') {
    condition.conditions.forEach((child, index) => validateTextCondition(context, child, `${path}.conditions.${index}`));
    return;
  }
  if (condition.type === 'not') validateTextCondition(context, condition.condition, `${path}.condition`);
}

function validateConditionIfPresent(context: ValidationContext, condition: TextCondition | undefined, path: string): void {
  if (condition) validateTextCondition(context, condition, path);
}

function validateTextRef(context: ValidationContext, ref: TextRef, path: string): void {
  if (ref.kind === 'output') {
    validateNodeRef(context, ref.node, path);
    return;
  }
  if (ref.kind === 'aggregate') validateAggregateRef(context, ref.name, path);
}

function validateNodeRef(context: ValidationContext, nodeId: string, path: string): void {
  if (!context.nodeIds.has(nodeId)) {
    addError(context, 'unresolved-ref', `Node "${nodeId}" does not exist`, path);
  }
}

function validateAggregateRef(context: ValidationContext, name: string, path: string): void {
  if (!context.aggregateNames.has(name)) {
    addError(context, 'unresolved-ref', `Aggregate "${name}" does not exist`, path);
  }
}

function validateParallelGroups(context: ValidationContext): void {
  const groups = new Map<string, { nodeId: string; provider: ProviderRef }[]>();
  Object.entries(context.graph.nodes).forEach(([nodeId, node]) => {
    if (node.kind !== 'step' || !node.parallelGroup) return;
    const group = groups.get(node.parallelGroup) ?? [];
    group.push({ nodeId, provider: node.provider });
    groups.set(node.parallelGroup, group);
  });

  for (const [groupName, nodes] of groups) {
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        if (!couldResolveSameProvider(context.graph, nodes[leftIndex].provider, nodes[rightIndex].provider)) continue;
        addError(
          context,
          'parallel-provider-collision',
          `Parallel group "${groupName}" nodes "${nodes[leftIndex].nodeId}" and "${nodes[rightIndex].nodeId}" could resolve to the same provider`,
          `parallelGroup.${groupName}`,
        );
      }
    }
  }
}

function couldResolveSameProvider(graph: WorkflowGraph, left: ProviderRef, right: ProviderRef): boolean {
  const leftPossibilities = providerPossibilities(graph, left);
  const rightPossibilities = providerPossibilities(graph, right);
  if (leftPossibilities.unknown || rightPossibilities.unknown) return true;
  for (const provider of leftPossibilities.providers) if (rightPossibilities.providers.has(provider)) return true;
  for (const role of leftPossibilities.roles) if (rightPossibilities.roles.has(role)) return true;
  return false;
}

function providerPossibilities(graph: WorkflowGraph, ref: ProviderRef): { providers: Set<AIProvider>; roles: Set<RoleKey>; unknown: boolean } {
  const providers = new Set<AIProvider>();
  const roles = new Set<RoleKey>();
  if (ref.type === 'provider') providers.add(ref.provider);
  else if (ref.type === 'role') {
    roles.add(ref.role);
    const provider = graph.roles[ref.role]?.defaultProvider;
    if (provider) providers.add(provider);
  } else if (ref.type === 'select') {
    ref.possibleRoles?.forEach((role) => {
      roles.add(role);
      const provider = graph.roles[role]?.defaultProvider;
      if (provider) providers.add(provider);
    });
  } else {
    return { providers, roles, unknown: true };
  }
  return { providers, roles, unknown: false };
}

function collectAggregateNames(graph: WorkflowGraph): Set<string> {
  const names = new Set<string>();
  Object.values(graph.nodes).forEach((node) => {
    if (node.kind === 'aggregate' || node.kind === 'fanout') names.add(node.output);
  });
  return names;
}

function collectLoopIds(graph: WorkflowGraph): Set<string> {
  const ids = new Set<string>();
  Object.values(graph.nodes).forEach((node) => {
    if (node.kind === 'loop') ids.add(node.loopId);
  });
  return ids;
}

function isAIProvider(value: string): value is AIProvider {
  return value in AI_PROVIDERS;
}

function addError(context: ValidationContext, code: GraphValidationError['code'], message: string, path: string): void {
  context.errors.push({ code, message, path });
}
