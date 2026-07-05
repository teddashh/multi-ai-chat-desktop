import { chooseStepTimeoutAction } from '../workflow';
import type { StepTimeoutAction } from '../workflow/stepTimeout';

export function chooseTimeoutDialogAction(action: StepTimeoutAction, onClose: () => void): void {
  chooseStepTimeoutAction(action);
  onClose();
}
