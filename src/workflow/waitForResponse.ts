import type { AIProvider, BridgeMessage } from '../../shared/types';
import { AI_PROVIDERS } from '../../shared/constants';
import { onBridgeMessage } from '../bridge/bus';
import { AWAITING_MAX_MS, setProviderAwaiting } from '../bridge/pull';
import { clearActiveTurn } from './state';

export const STEP_TIMEOUT_MS = AWAITING_MAX_MS + 30_000;

interface Waiter {
  provider: AIProvider;
  turn: number;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  settled: boolean;
  timer: ReturnType<typeof globalThis.setTimeout>;
}

const waiters = new Map<string, Waiter>();
let subscribed = false;

function key(provider: AIProvider, turn: number): string {
  return `${provider}:${turn}`;
}

export function ensureWorkflowBusSubscription(): void {
  if (subscribed) return;
  subscribed = true;
  onBridgeMessage(handleBridgeMessage);
}

function handleBridgeMessage(message: BridgeMessage): void {
  if (message.action !== 'RESPONSE_DONE') return;
  if (message.transport !== 'pull' && message.transport !== 'local') return;
  if (!message.provider) return;
  for (const waiter of [...waiters.values()]) {
    if (waiter.provider !== message.provider) continue;
    settle(waiter, 'resolve', payloadText(message.payload));
    return;
  }
}

function payloadText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object' && 'text' in payload) {
    const typed = payload as { text?: unknown };
    return typeof typed.text === 'string' ? typed.text : JSON.stringify(payload);
  }
  return JSON.stringify(payload ?? '');
}

export function waitForResponse(provider: AIProvider, turn: number): Promise<string> {
  ensureWorkflowBusSubscription();
  rejectExistingProviderWaiters(provider, new Error('superseded by a newer send'));
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      provider,
      turn,
      resolve,
      reject,
      settled: false,
      timer: globalThis.setTimeout(() => {
        const providerName = AI_PROVIDERS[provider]?.name ?? provider;
        settle(waiter, 'reject', new Error(`${providerName} response timed out after ${STEP_TIMEOUT_MS / 1000}s`));
      }, STEP_TIMEOUT_MS),
    };
    waiters.set(key(provider, turn), waiter);
  });
}

function rejectExistingProviderWaiters(provider: AIProvider, reason: Error): void {
  for (const waiter of [...waiters.values()]) {
    if (waiter.provider === provider && !waiter.settled) settle(waiter, 'reject', reason);
  }
}

function settle(waiter: Waiter, type: 'resolve', value: string): void;
function settle(waiter: Waiter, type: 'reject', value: Error): void;
function settle(waiter: Waiter, type: 'resolve' | 'reject', value: string | Error): void {
  if (waiter.settled) return;
  waiter.settled = true;
  globalThis.clearTimeout(waiter.timer);
  waiters.delete(key(waiter.provider, waiter.turn));
  clearActiveTurn(waiter.provider, waiter.turn);
  setProviderAwaiting(waiter.provider, false);
  if (type === 'resolve') waiter.resolve(value as string);
  else waiter.reject(value as Error);
}

export function rejectWaiter(provider: AIProvider, turn: number, reason: Error): void {
  const waiter = waiters.get(key(provider, turn));
  if (waiter) settle(waiter, 'reject', reason);
}

export function hasWaiter(provider: AIProvider, turn: number): boolean {
  return waiters.has(key(provider, turn));
}

export function resetWaitForResponseForTests(): void {
  for (const waiter of waiters.values()) globalThis.clearTimeout(waiter.timer);
  waiters.clear();
  subscribed = false;
}
