import { AI_PROVIDERS, DEFAULT_FREE_TARGET_PROVIDERS } from '../../../shared/constants';
import type { AIProvider, ChatMode } from '../../../shared/types';
import { getRuntimeAppVersion } from '../../appVersion';
import { host } from '../../host';
import { executeGraph, preflightGraph, workflowGraphs } from '../graph';
import type { WorkflowGraph } from '../graph';
import type { PreflightResult } from '../preflight';
import { prepareWorkflowRun } from '../runtime';
import { responseLanguagePolicyFromPrompt, type ResponseLanguagePolicy } from '../responseLanguage';
import { isSendable } from '../sendability';
import { getLastSnapshot } from './recorder';
import type { ExecutionSnapshot, RedactedValueRef } from './types';
import { isSnapshotRedactionTier } from './types';

export type SnapshotReplayErrorKind = 'parse' | 'schema' | 'not-found';

export class SnapshotReplayError extends Error {
  readonly kind: SnapshotReplayErrorKind;

  constructor(kind: SnapshotReplayErrorKind, message: string) {
    super(message);
    this.name = 'SnapshotReplayError';
    this.kind = kind;
  }
}

export type ReplayBlockReason =
  | 'unknown-graph'
  | 'graph-version-mismatch'
  | 'question-required'
  | 'preflight'
  | 'not-found';

export interface ReplayPlan {
  graph?: WorkflowGraph;
  roles: Partial<Record<string, AIProvider>>;
  targets?: AIProvider[];
  question?: string;
  needsQuestion: boolean;
  textComparable: boolean;
  priorOutputs?: Record<string, string>;
  priorHashes?: Record<string, string>;
  responseLanguagePolicy?: ResponseLanguagePolicy;
  blocked?: ReplayBlockReason;
  detail?: unknown;
}

export type ReplayResult =
  | { ok: true; plan: ReplayPlan; newSnapshotId?: string }
  | { ok: false; blocked: ReplayBlockReason; preflight?: PreflightResult; detail?: unknown };

interface ReplayOptions {
  replayWithCurrentGraph?: boolean;
  onSnapshotComplete?: (snapshot: ExecutionSnapshot) => void | Promise<void>;
  responseLanguagePolicy?: ResponseLanguagePolicy;
}

type ReplayInput = { snapshotId: string; question?: string } | { snapshot: ExecutionSnapshot; question?: string };

const RESPONSE_LANGUAGE_POLICY_GRAPH_VERSION = 2;

export function parseStoredSnapshot(json: string): ExecutionSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SnapshotReplayError('parse', 'Stored snapshot is not valid JSON.');
  }

  if (!isRecord(parsed)) throwSchemaError('Stored snapshot must be an object.');
  if (typeof parsed.snapshotId !== 'string') throwSchemaError('Stored snapshot snapshotId must be a string.');
  if (typeof parsed.graphId !== 'string') throwSchemaError('Stored snapshot graphId must be a string.');
  if (typeof parsed.graphVersion !== 'number' || !Number.isFinite(parsed.graphVersion)) {
    throwSchemaError('Stored snapshot graphVersion must be a finite number.');
  }
  if (!isSnapshotRedactionTier(parsed.redactionTier)) {
    throwSchemaError('Stored snapshot redactionTier is not recognized.');
  }
  if (!isRecord(parsed.roleMap)) throwSchemaError('Stored snapshot roleMap must be an object.');
  if (!Object.values(parsed.roleMap).every((value) => typeof value === 'string')) {
    throwSchemaError('Stored snapshot roleMap values must be strings.');
  }
  if (!Array.isArray(parsed.steps)) throwSchemaError('Stored snapshot steps must be an array.');
  if (!isRecord(parsed.userQuestion)) throwSchemaError('Stored snapshot userQuestion must be an object.');
  parsed.steps.forEach((step, index) => {
    if (!isRecord(step)) throwSchemaError(`Stored snapshot steps[${index}] must be an object.`);
    if (typeof step.nodeId !== 'string') throwSchemaError(`Stored snapshot steps[${index}].nodeId must be a string.`);
    if (!isRecord(step.inputRef)) throwSchemaError(`Stored snapshot steps[${index}].inputRef must be an object.`);
    if (!isRecord(step.outputRef)) throwSchemaError(`Stored snapshot steps[${index}].outputRef must be an object.`);
  });

  return parsed as unknown as ExecutionSnapshot;
}

export function planReplay(snapshot: ExecutionSnapshot, opts: { replayWithCurrentGraph?: boolean } = {}): ReplayPlan {
  const roles = runnableRoles(snapshot);
  const question = inlineText(snapshot.userQuestion);
  const needsQuestion = question === undefined;
  const textComparable = !needsQuestion;
  const basePlan: ReplayPlan = {
    roles,
    needsQuestion,
    textComparable,
    priorOutputs: snapshot.redactionTier === 'full-local' ? priorOutputs(snapshot) : undefined,
    priorHashes: snapshot.redactionTier === 'hashes' ? priorHashes(snapshot) : undefined,
    responseLanguagePolicy: retainedResponseLanguagePolicy(snapshot),
  };

  const liveGraph = (workflowGraphs as Partial<Record<string, WorkflowGraph>>)[snapshot.graphId as ChatMode];
  if (!liveGraph) {
    return { ...basePlan, blocked: 'unknown-graph', detail: { graphId: snapshot.graphId } };
  }

  const currentVersion = liveGraph.version ?? 1;
  if (snapshot.graphVersion !== currentVersion && !opts.replayWithCurrentGraph) {
    return {
      ...basePlan,
      graph: liveGraph,
      blocked: 'graph-version-mismatch',
      detail: { snapshotVersion: snapshot.graphVersion, currentVersion },
    };
  }

  return {
    ...basePlan,
    graph: liveGraph,
    targets: liveGraph.preflight.kind === 'free' ? freeTargets(snapshot) : undefined,
    question,
  };
}

export async function replaySnapshot(input: ReplayInput, options: ReplayOptions = {}): Promise<ReplayResult> {
  const snapshot = await replayInputSnapshot(input);
  if (!snapshot) return { ok: false, blocked: 'not-found' };

  const plan = planReplay(snapshot, { replayWithCurrentGraph: options.replayWithCurrentGraph });
  if (plan.blocked) return { ok: false, blocked: plan.blocked, detail: plan.detail };

  const question = plan.question ?? input.question;
  if (plan.needsQuestion && !input.question) return { ok: false, blocked: 'question-required' };
  if (!question) return { ok: false, blocked: 'question-required' };

  prepareWorkflowRun();

  const preflight = await preflightGraph(plan.graph!, plan.roles);
  if (!preflight.ok) return { ok: false, blocked: 'preflight', preflight };

  const targets = await replayTargets(plan);
  const appVersion = await getRuntimeAppVersion();
  const responseLanguagePolicy = plan.responseLanguagePolicy ?? options.responseLanguagePolicy;

  await executeGraph(
    plan.graph!,
    {
      text: question,
      roles: plan.roles,
      targets,
      ...(responseLanguagePolicy ? { responseLanguagePolicy } : {}),
    },
    {
      onSnapshotComplete: options.onSnapshotComplete,
      ...(appVersion ? { appVersion } : {}),
    },
  );

  return { ok: true, plan, newSnapshotId: getLastSnapshot()?.snapshotId };
}

async function replayInputSnapshot(input: ReplayInput): Promise<ExecutionSnapshot | undefined> {
  if ('snapshot' in input) return input.snapshot;
  const json = await host.snapshot.load(input.snapshotId);
  if (json === null) return undefined;
  return parseStoredSnapshot(json);
}

function throwSchemaError(message: string): never {
  throw new SnapshotReplayError('schema', message);
}

function runnableRoles(snapshot: ExecutionSnapshot): Partial<Record<string, AIProvider>> {
  const roles: Partial<Record<string, AIProvider>> = {};
  Object.entries(snapshot.roleMap).forEach(([role, provider]) => {
    if (isAIProvider(provider)) roles[role] = provider;
  });
  return roles;
}

function priorOutputs(snapshot: ExecutionSnapshot): Record<string, string> {
  const outputs: Record<string, string> = {};
  snapshot.steps.forEach((step) => {
    const text = inlineText(step.outputRef);
    if (text !== undefined) outputs[step.nodeId] = text;
  });
  return outputs;
}

function priorHashes(snapshot: ExecutionSnapshot): Record<string, string> {
  const hashes: Record<string, string> = {};
  snapshot.steps.forEach((step) => {
    if (typeof step.outputRef.sha256 === 'string') hashes[step.nodeId] = step.outputRef.sha256;
  });
  return hashes;
}

function retainedResponseLanguagePolicy(snapshot: ExecutionSnapshot): ResponseLanguagePolicy | undefined {
  if (snapshot.graphVersion < RESPONSE_LANGUAGE_POLICY_GRAPH_VERSION) return undefined;
  for (let index = snapshot.steps.length - 1; index >= 0; index -= 1) {
    const policy = responseLanguagePolicyFromPrompt(inlineText(snapshot.steps[index].inputRef));
    if (policy) return policy;
  }
  return undefined;
}

function freeTargets(snapshot: ExecutionSnapshot): AIProvider[] | undefined {
  const targets: AIProvider[] = [];
  snapshot.steps.forEach((step) => {
    if (isAIProvider(step.provider) && !targets.includes(step.provider)) targets.push(step.provider);
  });
  return targets.length > 0 ? targets : undefined;
}

async function replayTargets(plan: ReplayPlan): Promise<AIProvider[] | undefined> {
  if (plan.graph?.preflight.kind !== 'free') return plan.targets;
  const snapshot = await host.connections.get();
  const sendable = snapshot.filter(isSendable).map((state) => state.provider);
  return plan.targets === undefined
    ? sendable.filter((provider) => (DEFAULT_FREE_TARGET_PROVIDERS as readonly AIProvider[]).includes(provider))
    : plan.targets.filter((provider) => sendable.includes(provider));
}

function inlineText(ref: RedactedValueRef | undefined): string | undefined {
  return ref?.kind === 'inline' && typeof ref.text === 'string' ? ref.text : undefined;
}

function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && value in AI_PROVIDERS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
