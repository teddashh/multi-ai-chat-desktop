import type { AIProvider } from '../../shared/types';
import { resetProviderPullState } from '../bridge/pull';
import { abortWorkflow, checkAborted, getInFlightProviders, stopProvider } from './cancel';
import { sendAndWait } from './sendAndWait';
import { SKIP_RESPONSE } from './state';
import { awaitStepTimeoutAction, emitCountdown } from './stepTimeout';
import { tearDownWaiters } from './teardown';

export async function runStep(provider: AIProvider, prompt: string, reservedTurn?: number): Promise<{ response: string; turn: number }> {
  for (;;) {
    checkAborted();
    emitCountdown(provider);
    try {
      return await sendAndWait(provider, prompt, reservedTurn);
    } catch (error) {
      checkAborted();
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
