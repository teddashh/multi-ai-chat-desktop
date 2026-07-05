import type { AIProvider } from '../../shared/types';
import { setProviderAwaiting } from '../bridge/pull';
import { host } from '../host';
import { eventFromProviderSend } from '../diagnostics/eventLog';
import { recordEventLog } from '../diagnostics/eventLogStore';
import { clearInFlight, markInFlight } from './cancel';
import { reserveTurn } from './state';
import { rejectWaiter, waitForResponse } from './waitForResponse';

export function reserveProviderTurn(provider: AIProvider): number {
  return reserveTurn(provider);
}

export async function sendAndWait(provider: AIProvider, text: string, reservedTurn?: number): Promise<{ response: string; turn: number }> {
  const turn = reservedTurn ?? reserveTurn(provider);
  setProviderAwaiting(provider, true);
  const responsePromise = waitForResponse(provider, turn);
  markInFlight(provider);
  try {
    recordEventLog(eventFromProviderSend(provider, text));
    await host.provider.send(provider, text);
  } catch (error) {
    rejectWaiter(provider, turn, error instanceof Error ? error : new Error(String(error)));
    clearInFlight(provider);
    await responsePromise.catch(() => undefined);
    throw error;
  }
  try {
    const response = await responsePromise;
    return { response, turn };
  } finally {
    clearInFlight(provider);
  }
}
