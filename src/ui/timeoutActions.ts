import { chooseStepTimeoutAction } from '../workflow';
import type { StepTimeoutAction } from '../workflow/stepTimeout';

export function chooseTimeoutDialogAction(action: StepTimeoutAction, onClose: () => void, requestId?: number): boolean {
  const accepted = chooseStepTimeoutAction(action, requestId);
  if (accepted) onClose();
  return accepted;
}
