import type { WorkflowGraph } from '../graph/types';
import type {
  AIProviderV2,
  ExecutionSnapshot,
  ExecutionSnapshotHumanEdit,
  ExecutionSnapshotStep,
  RedactedValueRef,
} from './types';

const REDACTION_TIER = 'full-local' as const;
// TODO(N1b): replace with the app version source used by durable snapshot/export metadata.
const SNAPSHOT_APP_VERSION = '0.0.0';

let currentSnapshot: ExecutionSnapshot | undefined;
let lastSnapshot: ExecutionSnapshot | undefined;

export interface BeginSnapshotParams {
  graph: WorkflowGraph;
  roleMap: Record<string, AIProviderV2>;
  adapterVersions?: Partial<Record<AIProviderV2, number>>;
  appVersion?: string;
}

export interface RecordStepParams {
  nodeId: string;
  provider?: AIProviderV2;
  input: string;
  output: string;
  status: ExecutionSnapshotStep['status'];
  startedAt: string;
  completedAt?: string;
  retryOf?: string;
}

export interface RecordHumanEditParams {
  checkpointId: string;
  sourceNodeId: string;
  targetNodeId: string;
  before: string;
  after: string;
  editedAt?: string;
}

export function beginSnapshot({
  graph,
  roleMap,
  adapterVersions,
  appVersion = SNAPSHOT_APP_VERSION,
}: BeginSnapshotParams): ExecutionSnapshot {
  const snapshot: ExecutionSnapshot = {
    snapshotId: nextSnapshotId(),
    graphId: graph.id,
    graphVersion: graph.version ?? 1,
    appVersion,
    createdAt: nowIso(),
    adapterVersions: { ...(adapterVersions ?? {}) },
    roleMap: { ...roleMap },
    redactionTier: REDACTION_TIER,
    steps: [],
    humanEdits: [],
  };
  currentSnapshot = snapshot;
  return snapshot;
}

export function recordStep({ input, output, ...params }: RecordStepParams): void {
  if (!currentSnapshot) return;
  currentSnapshot.steps.push({
    ...params,
    inputRef: inlineRef(input),
    outputRef: inlineRef(output),
  });
}

export function recordHumanEdit({ before, after, editedAt, ...params }: RecordHumanEditParams): void {
  if (!currentSnapshot) return;
  const edit: ExecutionSnapshotHumanEdit = {
    ...params,
    beforeRef: inlineRef(before),
    afterRef: inlineRef(after),
    editedAt: editedAt ?? nowIso(),
  };
  currentSnapshot.humanEdits.push(edit);
}

export function completeSnapshot(completedAt = nowIso()): ExecutionSnapshot | undefined {
  if (!currentSnapshot) return undefined;
  currentSnapshot.completedAt = completedAt;
  lastSnapshot = currentSnapshot;
  currentSnapshot = undefined;
  return lastSnapshot;
}

export function getCurrentSnapshot(): ExecutionSnapshot | undefined {
  return currentSnapshot;
}

export function getLastSnapshot(): ExecutionSnapshot | undefined {
  return lastSnapshot;
}

export function resetSnapshotRecorderForTests(): void {
  currentSnapshot = undefined;
  lastSnapshot = undefined;
}

function inlineRef(text: string): RedactedValueRef {
  return {
    tier: REDACTION_TIER,
    kind: 'inline',
    text,
    byteLength: byteLength(text),
  };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function nextSnapshotId(): string {
  return `snapshot-${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}
