import type { AIProvider, ChatMode, ModeRoles } from '../../../shared/types';
import type { ResponseLanguagePolicy } from '../responseLanguage';

export type NodeId = string;
export type RoleKey = string;
export type ContextRef = string;
export type TextTemplate = string | { builder: string; args?: PromptArg[] };

export interface WorkflowGraph {
  schemaVersion: 1;
  id: string;
  version?: number;
  mode?: ChatMode;
  start: NodeId;
  roles: Record<RoleKey, GraphRole>;
  preflight: GraphPreflight;
  nodes: Record<NodeId, GraphNode>;
  edges: GraphEdge[];
  onComplete?: { status: '' };
}

export interface GraphRole {
  defaultProvider?: AIProvider;
  uiLabel?: string;
  runtimeLabel?: string;
}

export interface GraphPreflight {
  kind: 'free' | 'serial';
  requiredRoles?: RoleKey[] | 'allStaticAndPossibleRoles';
  aliasRules?: { roles: RoleKey[]; unique: true; reason: 'parallel' | 'seat' }[];
}

export type ProviderRef =
  | { type: 'role'; role: RoleKey }
  | { type: 'provider'; provider: AIProvider }
  | { type: 'target' }
  | { type: 'loopVar'; name: string }
  | { type: 'select'; cases: ProviderSelectCase[]; possibleRoles: RoleKey[] };

export interface ProviderSelectCase {
  when?: TextCondition;
  role: RoleKey;
}

export type GraphNode = StepNode | FanoutNode | AggregateNode | LoopNode | NoopNode;

export interface StepNode {
  kind: 'step';
  provider: ProviderRef;
  role?: string | TextTemplate;
  label?: string | TextTemplate;
  status?: TextTemplate;
  prompt: PromptSpec;
  output: string;
  policy: 'serialRunStep' | 'freeSendAndWait';
  checkpoint?: RelayCheckpointSpec;
  parallelGroup?: string;
  appendHistory?: HistoryAppendSpec;
}

export interface RelayCheckpointSpec {
  policy: 'draft-confirm';
}

export interface HistoryAppendSpec {
  history: string;
  value: {
    name?: { kind: 'providerName'; provider: ProviderRef };
    round?: { kind: 'loop'; name: string } | { kind: 'literal'; value: number };
    text: { kind: 'output'; node: NodeId } | { kind: 'selfOutput' };
  };
}

export interface FanoutNode {
  kind: 'fanout';
  over: { type: 'targets' } | { type: 'roles'; roles: RoleKey[] } | { type: 'loopList'; ref: ContextRef };
  template: Omit<StepNode, 'kind' | 'provider'> & { provider: ProviderRef };
  output: string;
  join: 'all';
  errorPolicy: 'fail' | 'swallow';
}

export interface AggregateNode {
  kind: 'aggregate';
  output: string;
  strategy:
    | { type: 'joinText'; inputs: TextRef[]; separator: string }
    | { type: 'vote'; ballots: TextRef[]; ballotRegex: string; quorum?: number; tieBreak: 'first' | 'role' | 'fail' }
    | { type: 'pickByCondition'; cases: { when: TextCondition; value: TextRef }[]; fallback: TextRef };
}

export interface LoopNode {
  kind: 'loop';
  loopId: string;
  init?: Record<string, unknown>;
  maxIterations: number;
  continueWhen?: TextCondition;
  terminateWhen?: TextCondition;
  bodyStart: NodeId;
  after: NodeId;
}

export interface NoopNode {
  kind: 'noop';
  status?: TextTemplate;
}

export interface GraphEdge {
  from: NodeId | NodeId[];
  to: NodeId;
  when?: TextCondition;
  priority?: number;
}

export interface PromptSpec {
  builder: string;
  args: PromptArg[];
}

export type PromptArg =
  | { kind: 'input'; name: 'question' }
  | { kind: 'output'; node: NodeId }
  | { kind: 'aggregate'; name: string }
  | { kind: 'providerName'; provider: ProviderRef }
  | { kind: 'history'; name: string }
  | { kind: 'loop'; name: string }
  | { kind: 'literal'; value: string | number };

export type TextRef =
  | { kind: 'input'; name: 'question' }
  | { kind: 'output'; node: NodeId }
  | { kind: 'aggregate'; name: string }
  | { kind: 'historyText'; name: string }
  | { kind: 'literal'; text: string };

export type TextCondition =
  | { type: 'always' }
  | { type: 'textIncludes'; ref: TextRef; value: string; caseSensitive?: boolean }
  | { type: 'regex'; ref: TextRef; pattern: string; flags?: string }
  | { type: 'equals'; left: TextRef; right: TextRef; normalize?: 'trim' | 'lower' | 'whitespace' }
  | {
      type: 'similarityAtLeast';
      left: TextRef;
      right: TextRef;
      threshold: number;
      algorithm: 'tokenJaccard' | 'levenshteinRatio';
    }
  | { type: 'all'; conditions: TextCondition[] }
  | { type: 'any'; conditions: TextCondition[] }
  | { type: 'not'; condition: TextCondition };

export interface ExecuteGraphParams {
  text: string;
  context?: string;
  roles?: ModeRoles | Partial<Record<RoleKey, AIProvider>>;
  targets?: AIProvider[];
  checkpoints?: boolean;
  responseLanguagePolicy?: ResponseLanguagePolicy;
}

export interface StepOutput {
  text: string;
  provider?: AIProvider;
  turn?: number;
}

export interface HistoryItem {
  name?: string;
  round?: number;
  text: string;
}
