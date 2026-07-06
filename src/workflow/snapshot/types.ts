import type { AIProvider } from '../../../shared/types';

export type AIProviderV2 = AIProvider | 'claude-code';

export type SnapshotRedactionTier = 'metadata-only' | 'hashes' | 'prompt-text' | 'full-local';

export interface RedactedValueRef {
  tier: SnapshotRedactionTier;
  kind: 'omitted' | 'hash' | 'inline' | 'artifact';
  sha256?: string;
  text?: string;
  artifactId?: string;
  byteLength?: number;
  truncated?: boolean;
}

export interface ExecutionSnapshotStep {
  nodeId: string;
  provider?: AIProviderV2;
  inputRef: RedactedValueRef;
  outputRef: RedactedValueRef;
  status: 'pending' | 'running' | 'checkpoint' | 'done' | 'skipped' | 'error' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  retryOf?: string;
}

export interface ExecutionSnapshotHumanEdit {
  checkpointId: string;
  sourceNodeId: string;
  targetNodeId: string;
  beforeRef: RedactedValueRef;
  afterRef: RedactedValueRef;
  editedAt: string;
}

export interface ExecutionSnapshot {
  snapshotId: string;
  graphId: string;
  graphVersion: number;
  appVersion: string;
  createdAt: string;
  completedAt?: string;
  adapterVersions: Partial<Record<AIProviderV2, number>>;
  roleMap: Record<string, AIProviderV2>;
  redactionTier: SnapshotRedactionTier;
  steps: ExecutionSnapshotStep[];
  humanEdits: ExecutionSnapshotHumanEdit[];
}
