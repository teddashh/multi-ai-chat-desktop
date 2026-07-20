import type { AIProvider } from '../../shared/types';
import { resetProviderPullState } from '../bridge/pull';
import { abortWorkflow, checkAborted, getInFlightProviders, onWorkflowAbort, stopProvider } from './cancel';
import { isRetryableSendRejection, providerResponseError, ProviderResponseError } from './providerResponse';
import { sendAndWait } from './sendAndWait';
import { SKIP_RESPONSE } from './state';
import { awaitStepTimeoutAction, emitCountdown } from './stepTimeout';
import { tearDownWaiters } from './teardown';

export const SEND_REJECTION_RETRY_DELAY_MS = 1_500;

function waitForSendRetry(): Promise<void> {
  checkAborted();
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      unsubscribe();
      resolve();
    }, SEND_REJECTION_RETRY_DELAY_MS);
    const unsubscribe = onWorkflowAbort((reason) => {
      globalThis.clearTimeout(timer);
      unsubscribe();
      reject(reason);
    });
  });
}

export async function runStep(provider: AIProvider, prompt: string, reservedTurn?: number): Promise<{ response: string; turn: number }> {
  let sendRejectionRetries = 0;
  for (;;) {
    checkAborted();
    emitCountdown(provider);
    try {
      const result = await sendAndWait(provider, prompt, reservedTurn);
      const responseError = providerResponseError(provider, result.response);
      if (!responseError) return result;
      if (sendRejectionRetries === 0 && isRetryableSendRejection(responseError)) {
        sendRejectionRetries += 1;
        await waitForSendRetry();
        continue;
      }
      throw responseError;
    } catch (error) {
      checkAborted();
      if (error instanceof ProviderResponseError) throw error;
      emitCountdown(provider, 0, true);
      const action = await awaitStepTimeoutAction();
      if (action === 'retry') {
        await stopProvider(provider);
        resetProviderPullState(provider);
        continue;
      }
      if (action === 'skip') return { response: SKIP_RESPONSE, turn: -1 };
      if (action === 'cancel') {
        abortWorkflow();
        await stopProvider(provider);
        await tearDownWaiters(getInFlightProviders(), { stopClick: true });
      }
      throw error;
    }
  }
}
