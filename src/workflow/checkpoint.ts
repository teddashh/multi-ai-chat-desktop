import type { AIProvider } from '../../shared/types';
import { onBridgeMessage } from '../bridge/bus';
import { onWorkflowAbort } from './cancel';

export interface PendingCheckpoint {
  nodeId: string;
  sourceNodeId?: string;
  provider: AIProvider;
  draft: string;
}

export type CheckpointDecision = { action: 'confirm'; draft: string } | { action: 'skip' };

type CheckpointSubscriber = (checkpoint: PendingCheckpoint | undefined) => void;

interface CheckpointWaiter {
  checkpoint: PendingCheckpoint;
  resolve: (value: CheckpointDecision) => void;
  reject: (reason: Error) => void;
  settled: boolean;
}

const waiters = new Map<string, CheckpointWaiter>();
const subscribers = new Set<CheckpointSubscriber>();

let unsubscribeAbort: (() => void) | undefined;
let unsubscribeCancelBridge: (() => void) | undefined;

export function awaitCheckpoint(checkpoint: PendingCheckpoint): Promise<CheckpointDecision> {
  ensureCheckpointCancelSubscription();
  rejectCheckpoint(checkpoint.nodeId, new Error('superseded by a newer checkpoint'));
  return new Promise((resolve, reject) => {
    const waiter: CheckpointWaiter = {
      checkpoint,
      resolve,
      reject,
      settled: false,
    };
    waiters.set(checkpoint.nodeId, waiter);
    notify(checkpoint);
  });
}

export function resolveCheckpoint(nodeId: string, decision: CheckpointDecision): void {
  const waiter = waiters.get(nodeId);
  if (!waiter) return;
  settle(waiter, 'resolve', decision);
}

export function rejectPendingCheckpoints(reason = new Error('Workflow cancelled by user')): void {
  for (const waiter of [...waiters.values()]) settle(waiter, 'reject', reason);
}

export function onCheckpoint(callback: CheckpointSubscriber): () => void {
  subscribers.add(callback);
  const current = [...waiters.values()].find((waiter) => !waiter.settled)?.checkpoint;
  if (current) callback(current);
  return () => offCheckpoint(callback);
}

export function offCheckpoint(callback: CheckpointSubscriber): void {
  subscribers.delete(callback);
}

export function hasPendingCheckpoint(nodeId: string): boolean {
  return waiters.has(nodeId);
}

export function resetCheckpointForTests(): void {
  rejectPendingCheckpoints(new Error('checkpoint reset'));
  waiters.clear();
  subscribers.clear();
  unsubscribeAbort?.();
  unsubscribeAbort = undefined;
  unsubscribeCancelBridge?.();
  unsubscribeCancelBridge = undefined;
}

function ensureCheckpointCancelSubscription(): void {
  if (!unsubscribeAbort) {
    unsubscribeAbort = onWorkflowAbort((reason) => {
      rejectPendingCheckpoints(reason);
    });
  }
  if (!unsubscribeCancelBridge) {
    unsubscribeCancelBridge = onBridgeMessage((message) => {
      if (message.action === 'CANCEL_WORKFLOW') rejectPendingCheckpoints();
    });
  }
}

function rejectCheckpoint(nodeId: string, reason: Error): void {
  const waiter = waiters.get(nodeId);
  if (waiter) settle(waiter, 'reject', reason);
}

function settle(waiter: CheckpointWaiter, type: 'resolve', value: CheckpointDecision): void;
function settle(waiter: CheckpointWaiter, type: 'reject', value: Error): void;
function settle(waiter: CheckpointWaiter, type: 'resolve' | 'reject', value: CheckpointDecision | Error): void {
  if (waiter.settled) return;
  waiter.settled = true;
  waiters.delete(waiter.checkpoint.nodeId);
  notify(undefined);
  if (type === 'resolve') waiter.resolve(value as CheckpointDecision);
  else waiter.reject(value as Error);
}

function notify(checkpoint: PendingCheckpoint | undefined): void {
  for (const subscriber of [...subscribers]) subscriber(checkpoint);
}
