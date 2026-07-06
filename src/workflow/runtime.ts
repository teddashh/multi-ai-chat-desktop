import { onBridgeMessage } from '../bridge/bus';
import { abortWorkflow, getInFlightProviders, resetCancelState } from './cancel';
import { sendWorkflowStatus } from './events';
import { resetWorkflowState } from './state';
import { cancelPendingStepTimeoutAction, resetStepTimeoutActionState } from './stepTimeout';
import { tearDownWaiters } from './teardown';
import { ensureWorkflowBusSubscription } from './waitForResponse';

let cancelSubscribed = false;

export function resetWorkflowRuntimeForTests(): void {
  cancelSubscribed = false;
}

export function prepareWorkflowRun(): void {
  ensureWorkflowBusSubscription();
  ensureCancelSubscription();
  resetCancelState();
  resetWorkflowState();
  resetStepTimeoutActionState();
}

function ensureCancelSubscription(): void {
  if (cancelSubscribed) return;
  cancelSubscribed = true;
  onBridgeMessage((message) => {
    if (message.action !== 'CANCEL_WORKFLOW') return;
    abortWorkflow();
    cancelPendingStepTimeoutAction();
    void tearDownWaiters(getInFlightProviders(), { stopClick: true });
    sendWorkflowStatus('');
  });
}
