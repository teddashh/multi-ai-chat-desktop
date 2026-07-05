import type { StepTimeoutDialogState } from './StepTimeoutDialog';

export type StepTimeoutEvent =
  | { provider: string; remainingMs: number; timedOut: boolean }
  | { type: 'settle' };

export function nextStepTimeoutState(
  previous: StepTimeoutDialogState | undefined,
  event: StepTimeoutEvent,
): StepTimeoutDialogState | undefined {
  if ('type' in event) return previous?.timedOut ? previous : undefined;
  return { provider: event.provider, remainingMs: event.remainingMs, timedOut: event.timedOut };
}
