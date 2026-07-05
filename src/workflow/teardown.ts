import type { AIProvider } from '../../shared/types';
import { setProviderAwaiting } from '../bridge/pull';
import { clearInFlight, stopProvider } from './cancel';
import { bumpTurnEpoch, getActiveTurn } from './state';
import { rejectWaiter } from './waitForResponse';

export async function tearDownWaiters(providers: AIProvider[], options: { stopClick?: boolean } = {}): Promise<void> {
  await Promise.all(
    providers.map(async (provider) => {
      if (options.stopClick) await stopProvider(provider);
      const turn = getActiveTurn(provider);
      if (turn !== undefined) rejectWaiter(provider, turn, new Error('Workflow cancelled by user'));
      setProviderAwaiting(provider, false);
      clearInFlight(provider);
    }),
  );
  bumpTurnEpoch();
}
