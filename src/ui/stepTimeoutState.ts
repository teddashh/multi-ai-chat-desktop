import type { StepTimeoutDialogState } from './StepTimeoutDialog';
import type { StepTimeoutEvent as WorkflowStepTimeoutEvent } from '../workflow/stepTimeout';

export type StepTimeoutEvent = WorkflowStepTimeoutEvent | { type: 'settle' };

export function nextStepTimeoutState(
  previous: StepTimeoutDialogState | undefined,
  event: StepTimeoutEvent,
): StepTimeoutDialogState | undefined {
  if ('type' in event) return previous?.timedOut ? previous : undefined;
  if (previous?.timedOut && !event.timedOut) return previous;
  return {
    provider: event.provider,
    remainingMs: event.remainingMs,
    timedOut: event.timedOut,
    ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
    ...(event.failureKind === undefined ? {} : { failureKind: event.failureKind }),
  };
}
