import { CHAT_MODES } from '../../shared/constants';
import type { ChatMode } from '../../shared/types';
import { recordEventLog } from '../diagnostics/eventLogStore';
import { host } from '../host';

export interface SessionCheckpoint {
  graphId: string;
  graphVersion: number;
  mode: ChatMode;
  questionHash: string;
  stepIndex: number;
  pendingCheckpointNodeId?: string;
  startedAt: string;
  updatedAt: string;
}

export interface BeginSessionCheckpointParams {
  graphId: string;
  graphVersion: number;
  mode: ChatMode;
  question: string;
}

export interface UpdateSessionCheckpointParams {
  stepIndex?: number;
  pendingCheckpointNodeId?: string | null;
}

const ENCODER = new TextEncoder();

let currentCheckpoint: SessionCheckpoint | undefined;
let writeQueue: Promise<void> = Promise.resolve();
let hashPatch: Promise<void> | undefined;
let generation = 0;

export function beginSessionCheckpoint({
  graphId,
  graphVersion,
  mode,
  question,
}: BeginSessionCheckpointParams): void {
  const now = nowIso();
  generation += 1;
  const checkpointGeneration = generation;
  currentCheckpoint = {
    graphId,
    graphVersion,
    mode,
    questionHash: '',
    stepIndex: 0,
    startedAt: now,
    updatedAt: now,
  };
  saveCurrentCheckpoint('save');

  hashPatch = sha256Hex(question)
    .then((questionHash) => {
      if (generation !== checkpointGeneration || !currentCheckpoint) return;
      currentCheckpoint = {
        ...currentCheckpoint,
        questionHash,
        updatedAt: nowIso(),
      };
      saveCurrentCheckpoint('save');
    })
    .catch((reason: unknown) => {
      recordSessionCheckpointFailure('hash', reason);
    });
}

export function updateSessionCheckpoint(patch: UpdateSessionCheckpointParams): void {
  if (!currentCheckpoint) return;
  const next: SessionCheckpoint = {
    ...currentCheckpoint,
    updatedAt: nowIso(),
  };

  if (typeof patch.stepIndex === 'number' && Number.isFinite(patch.stepIndex)) {
    next.stepIndex = Math.max(0, Math.floor(patch.stepIndex));
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'pendingCheckpointNodeId')) {
    if (patch.pendingCheckpointNodeId) next.pendingCheckpointNodeId = patch.pendingCheckpointNodeId;
    else delete next.pendingCheckpointNodeId;
  }

  currentCheckpoint = next;
  saveCurrentCheckpoint('save');
}

export function clearSessionCheckpoint(): void {
  generation += 1;
  currentCheckpoint = undefined;
  hashPatch = undefined;
  enqueueWrite('clear', () => host.sessionCheckpoint.clear());
}

export function parseSessionCheckpoint(json: string): SessionCheckpoint | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  if (typeof parsed.graphId !== 'string' || parsed.graphId.trim() === '') return undefined;
  if (typeof parsed.graphVersion !== 'number' || !Number.isFinite(parsed.graphVersion)) return undefined;
  if (!isChatMode(parsed.mode)) return undefined;
  if (typeof parsed.questionHash !== 'string') return undefined;
  if (typeof parsed.stepIndex !== 'number' || !Number.isFinite(parsed.stepIndex)) return undefined;
  if (typeof parsed.startedAt !== 'string' || typeof parsed.updatedAt !== 'string') return undefined;
  if (
    parsed.pendingCheckpointNodeId !== undefined &&
    typeof parsed.pendingCheckpointNodeId !== 'string'
  ) {
    return undefined;
  }

  return {
    graphId: parsed.graphId,
    graphVersion: parsed.graphVersion,
    mode: parsed.mode,
    questionHash: parsed.questionHash,
    stepIndex: Math.max(0, Math.floor(parsed.stepIndex)),
    startedAt: parsed.startedAt,
    updatedAt: parsed.updatedAt,
    ...(parsed.pendingCheckpointNodeId ? { pendingCheckpointNodeId: parsed.pendingCheckpointNodeId } : {}),
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const digest = await subtle.digest('SHA-256', ENCODER.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function flushSessionCheckpointForTests(): Promise<void> {
  await writeQueue;
  await hashPatch?.catch(() => undefined);
  await writeQueue;
}

export function resetSessionCheckpointForTests(): void {
  generation += 1;
  currentCheckpoint = undefined;
  writeQueue = Promise.resolve();
  hashPatch = undefined;
}

function saveCurrentCheckpoint(operation: 'save'): void {
  if (!currentCheckpoint) return;
  const json = JSON.stringify(currentCheckpoint);
  enqueueWrite(operation, () => host.sessionCheckpoint.save(json));
}

function enqueueWrite(operation: 'save' | 'clear', write: () => Promise<void>): void {
  writeQueue = writeQueue.then(write, write).catch((reason: unknown) => {
    recordSessionCheckpointFailure(operation, reason);
  });
  void writeQueue;
}

function recordSessionCheckpointFailure(operation: 'save' | 'clear' | 'hash', reason: unknown): void {
  recordEventLog({
    kind: 'workflow-error',
    summary: 'Session checkpoint failed; run continued',
    detail: {
      operation,
      failure: classifyFailure(reason),
    },
  });
}

function classifyFailure(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/denied|permission/i.test(message)) return 'permission';
  if (/space|full|quota/i.test(message)) return 'disk';
  if (/crypto|sha|subtle/i.test(message)) return 'hash-unavailable';
  return 'write-failed';
}

function nowIso(): string {
  return new Date().toISOString();
}

function isChatMode(value: unknown): value is ChatMode {
  return typeof value === 'string' && value in CHAT_MODES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
