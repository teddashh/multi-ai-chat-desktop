import { STEP_TIMEOUT_MS } from './waitForResponse';

export const STEP_COUNTDOWN_MS = 600_000;
export type StepTimeoutAction = 'retry' | 'skip' | 'cancel';
export type StepRecoveryFailureKind = 'timeout' | 'provider-error';
export type StepRecoveryDetail = 'provider-page-reloaded';

export class StepTimeoutActionSupersededError extends Error {
  constructor() {
    super('Step timeout action superseded by a new workflow');
    this.name = 'StepTimeoutActionSupersededError';
  }
}

export interface StepTimeoutEvent {
  provider: string;
  remainingMs: number;
  timedOut: boolean;
  requestId?: number;
  failureKind?: StepRecoveryFailureKind;
  recoveryDetail?: StepRecoveryDetail;
}

interface PendingAction {
  requestId: number;
  provider: string;
  failureKind: StepRecoveryFailureKind;
  recoveryDetail?: StepRecoveryDetail;
  resolve: (action: StepTimeoutAction) => void;
  reject: (error: Error) => void;
}

type Listener = (event: StepTimeoutEvent) => void;

const listeners = new Set<Listener>();
let nextAction: StepTimeoutAction | undefined;
let activeAction: PendingAction | undefined;
const pendingActions: PendingAction[] = [];
let nextRequestId = 1;
let activationGeneration = 0;
let activationScheduled = false;

export function onStepTimeoutEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function chooseStepTimeoutAction(action: StepTimeoutAction, requestId?: number): boolean {
  if (!activeAction && requestId === undefined && pendingActions.length > 0) activateNextAction();
  if (activeAction) {
    if (requestId !== undefined && requestId !== activeAction.requestId) return false;
    const current = activeAction;
    activeAction = undefined;
    nextAction = undefined;
    current.resolve(action);
    if (action === 'cancel') settleAllPendingActions('cancel');
    else scheduleNextAction();
    return true;
  }
  if (requestId !== undefined) return false;
  nextAction = action;
  return true;
}

export function consumeStepTimeoutAction(): StepTimeoutAction | undefined {
  const action = nextAction;
  nextAction = undefined;
  return action;
}

export function awaitStepTimeoutAction(
  provider = 'unknown',
  failureKind: StepRecoveryFailureKind = 'timeout',
  recoveryDetail?: StepRecoveryDetail,
): Promise<StepTimeoutAction> {
  const action = consumeStepTimeoutAction();
  if (action) return Promise.resolve(action);
  return new Promise((resolve, reject) => {
    pendingActions.push({ requestId: nextRequestId, provider, failureKind, recoveryDetail, resolve, reject });
    nextRequestId += 1;
    activateNextAction();
  });
}

export function resetStepTimeoutActionState(): void {
  nextAction = undefined;
  rejectAllPendingActions(new StepTimeoutActionSupersededError());
}

export function cancelPendingStepTimeoutAction(): void {
  nextAction = undefined;
  settleAllPendingActions('cancel');
}

export function emitCountdown(provider: string, remainingMs = STEP_COUNTDOWN_MS): void {
  emit({ provider, remainingMs, timedOut: false });
}

export function resetStepTimeoutForTests(): void {
  listeners.clear();
  resetStepTimeoutActionState();
}

function activateNextAction(): void {
  if (activeAction || pendingActions.length === 0) return;
  activeAction = pendingActions.shift();
  if (!activeAction) return;
  emit({
    provider: activeAction.provider,
    remainingMs: 0,
    timedOut: true,
    requestId: activeAction.requestId,
    failureKind: activeAction.failureKind,
    ...(activeAction.recoveryDetail ? { recoveryDetail: activeAction.recoveryDetail } : {}),
  });
}

function scheduleNextAction(): void {
  if (activationScheduled || activeAction || pendingActions.length === 0) return;
  activationScheduled = true;
  const generation = activationGeneration;
  queueMicrotask(() => {
    if (generation !== activationGeneration) return;
    activationScheduled = false;
    activateNextAction();
  });
}

function settleAllPendingActions(action: StepTimeoutAction): void {
  const pending = takeAllPendingActions();
  pending.forEach((item) => item.resolve(action));
}

function rejectAllPendingActions(error: Error): void {
  const pending = takeAllPendingActions();
  pending.forEach((item) => item.reject(error));
}

function takeAllPendingActions(): PendingAction[] {
  activationGeneration += 1;
  activationScheduled = false;
  const pending = activeAction ? [activeAction, ...pendingActions] : [...pendingActions];
  activeAction = undefined;
  pendingActions.length = 0;
  return pending;
}

function emit(event: StepTimeoutEvent): void {
  for (const listener of [...listeners]) listener(event);
}

export { STEP_TIMEOUT_MS };
