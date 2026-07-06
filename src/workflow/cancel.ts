import type { AIProvider } from '../../shared/types';
import { host } from '../host';

let workflowAborted = false;
const inFlight = new Set<AIProvider>();
const abortListeners = new Set<(reason: Error) => void>();

export function resetCancelState(): void {
  workflowAborted = false;
  inFlight.clear();
}

export function markInFlight(provider: AIProvider): void {
  inFlight.add(provider);
}

export function clearInFlight(provider: AIProvider): void {
  inFlight.delete(provider);
}

export function getInFlightProviders(): AIProvider[] {
  return [...inFlight];
}

export function abortWorkflow(): void {
  workflowAborted = true;
  const reason = new Error('Workflow cancelled by user');
  for (const listener of [...abortListeners]) listener(reason);
}

export function checkAborted(): void {
  if (workflowAborted) throw new Error('Workflow cancelled by user');
}

export function onWorkflowAbort(listener: (reason: Error) => void): () => void {
  abortListeners.add(listener);
  return () => abortListeners.delete(listener);
}

export async function stopProvider(provider: AIProvider): Promise<void> {
  await host.provider.eval(
    provider,
    "window.__MAC_ENGINE__ && typeof window.__MAC_ENGINE__.stop === 'function' && window.__MAC_ENGINE__.stop();",
  ).catch(() => undefined);
}
