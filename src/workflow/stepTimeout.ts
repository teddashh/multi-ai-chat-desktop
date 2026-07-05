import { STEP_TIMEOUT_MS } from './waitForResponse';

export const STEP_COUNTDOWN_MS = 600_000;
export type StepTimeoutAction = 'retry' | 'skip' | 'cancel';

type Listener = (event: { provider: string; remainingMs: number; timedOut: boolean }) => void;

const listeners = new Set<Listener>();
let nextAction: StepTimeoutAction | undefined;
let pendingAction: ((action: StepTimeoutAction) => void) | undefined;

export function onStepTimeoutEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function chooseStepTimeoutAction(action: StepTimeoutAction): void {
  if (pendingAction) {
    const resolve = pendingAction;
    pendingAction = undefined;
    nextAction = undefined;
    resolve(action);
    return;
  }
  nextAction = action;
}

export function consumeStepTimeoutAction(): StepTimeoutAction | undefined {
  const action = nextAction;
  nextAction = undefined;
  return action;
}

export function awaitStepTimeoutAction(): Promise<StepTimeoutAction> {
  const action = consumeStepTimeoutAction();
  if (action) return Promise.resolve(action);
  return new Promise((resolve) => {
    pendingAction = resolve;
  });
}

export function resetStepTimeoutActionState(): void {
  nextAction = undefined;
  pendingAction = undefined;
}

export function cancelPendingStepTimeoutAction(): void {
  if (pendingAction) {
    const resolve = pendingAction;
    pendingAction = undefined;
    nextAction = undefined;
    resolve('cancel');
    return;
  }
  nextAction = undefined;
}

export function emitCountdown(provider: string, remainingMs = STEP_COUNTDOWN_MS, timedOut = false): void {
  for (const listener of [...listeners]) listener({ provider, remainingMs, timedOut });
}

export function resetStepTimeoutForTests(): void {
  listeners.clear();
  resetStepTimeoutActionState();
}

export { STEP_TIMEOUT_MS };
