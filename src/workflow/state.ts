import type { AIProvider } from '../../shared/types';

export const SKIP_RESPONSE = '(no response — skipped)';

let nextTurn = 0;
const activeTurns = new Map<AIProvider, number>();

export function resetWorkflowStateForTests(): void {
  nextTurn = 0;
  activeTurns.clear();
}

export function resetWorkflowState(): void {
  resetWorkflowStateForTests();
}

export function reserveTurn(provider: AIProvider): number {
  nextTurn += 1;
  activeTurns.set(provider, nextTurn);
  return nextTurn;
}

export function getActiveTurn(provider: AIProvider): number | undefined {
  return activeTurns.get(provider);
}

export function clearActiveTurn(provider: AIProvider, turn: number): void {
  if (activeTurns.get(provider) === turn) activeTurns.delete(provider);
}

export function bumpTurnEpoch(): void {
  nextTurn += 1;
  activeTurns.clear();
}
