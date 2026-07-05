import { POLL_PULL_MS } from '../../shared/constants';
import type { AIProvider, BridgeMessage } from '../../shared/types';
import { host } from '../host';
import { publishBridgeMessage } from './bus';

export const DONE_WATCHDOG_MS = 5000;
export const AWAITING_MAX_MS = 10 * 60 * 1000;

const lastConsumed = new Map<string, { bootId: string; mid: number }>();
const pending = new Set<AIProvider>();
const degraded = new Set<AIProvider>();
const pollTimers = new Map<AIProvider, ReturnType<typeof globalThis.setInterval>>();
const pullInflight = new Map<AIProvider, { promise: Promise<void>; force: boolean }>();
const activeBoot = new Map<AIProvider, string>();
const doneTimers = new Map<AIProvider, ReturnType<typeof globalThis.setTimeout>>();
const awaitingSince = new Map<AIProvider, number>();
let subscriptionPromise: Promise<() => void> | undefined;
let cleanupSubscription: (() => void) | undefined;
let refCount = 0;

export async function startBridgePull(): Promise<() => void> {
  refCount += 1;
  if (!subscriptionPromise) {
    subscriptionPromise = host.bridge.subscribeTitle(handleTitleMessage);
    void subscriptionPromise.then((cleanup) => {
      cleanupSubscription = cleanup;
      if (refCount === 0) {
        cleanupSubscription();
        cleanupSubscription = undefined;
        subscriptionPromise = undefined;
      }
    });
  }
  await subscriptionPromise;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && cleanupSubscription) {
      cleanupSubscription();
      cleanupSubscription = undefined;
      subscriptionPromise = undefined;
      for (const provider of [...pending]) setProviderAwaiting(provider, false);
      for (const timer of doneTimers.values()) globalThis.clearTimeout(timer);
      doneTimers.clear();
    }
  };
}

export function handleTitleMessage(message: BridgeMessage): void {
  if (message.transport === 'title' && message.action !== 'STATUS_REPORT') return;
  if (message.provider && message.bootId) {
    const current = activeBoot.get(message.provider);
    if (current !== message.bootId) {
      activeBoot.set(message.provider, message.bootId);
      lastConsumed.delete(message.provider);
      recoverProvider(message.provider);
    }
  }
  publish(message);
  if (!message.provider) return;
  const payload = message.payload as { bulkReady?: number; doneReady?: boolean } | undefined;
  if (typeof payload?.bulkReady === 'number' && payload.bulkReady > 0) {
    void pullProvider(message.provider);
    if (payload.doneReady === true) armDoneWatchdog(message.provider);
  }
}

export function recoverProvider(provider: AIProvider): void {
  clearDoneWatchdog(provider);
  if (!degraded.delete(provider)) return;
  publish({
    v: 1,
    action: 'STATUS_REPORT',
    provider,
    payload: { bridge: 'ok' },
    transport: 'local',
  });
  if (pending.has(provider)) ensurePoll(provider);
}

export function resetProviderPullState(provider: AIProvider): void {
  // Preserve activeBoot/lastConsumed so retry cannot re-deliver already consumed outbox entries.
  recoverProvider(provider);
}

export function resetProviderBootState(provider: AIProvider): void {
  activeBoot.delete(provider);
  lastConsumed.delete(provider);
  recoverProvider(provider);
}

export function setProviderAwaiting(provider: AIProvider, awaiting: boolean): void {
  if (awaiting) {
    pending.add(provider);
    awaitingSince.set(provider, Date.now());
    ensurePoll(provider);
    return;
  }
  pending.delete(provider);
  awaitingSince.delete(provider);
  const timer = pollTimers.get(provider);
  if (timer !== undefined) globalThis.clearInterval(timer);
  pollTimers.delete(provider);
  clearDoneWatchdog(provider);
}

function ensurePoll(provider: AIProvider): void {
  if (pollTimers.has(provider) || degraded.has(provider)) return;
  const timer = globalThis.setInterval(() => {
    const started = awaitingSince.get(provider);
    if (started !== undefined && Date.now() - started > AWAITING_MAX_MS) {
      synthesizeDone(provider, '[Error: bridge degraded]');
      return;
    }
    if (pending.has(provider)) void pullProvider(provider);
  }, POLL_PULL_MS);
  pollTimers.set(provider, timer);
}

function armDoneWatchdog(provider: AIProvider): void {
  if (!pending.has(provider)) return;
  clearDoneWatchdog(provider);
  const timer = globalThis.setTimeout(() => {
    doneTimers.delete(provider);
    void (async () => {
      await pullProvider(provider, { force: true });
      if (pending.has(provider)) synthesizeDone(provider, '[Error: bridge degraded]');
    })();
  }, DONE_WATCHDOG_MS);
  doneTimers.set(provider, timer);
}

function clearDoneWatchdog(provider: AIProvider): void {
  const doneTimer = doneTimers.get(provider);
  if (doneTimer !== undefined) globalThis.clearTimeout(doneTimer);
  doneTimers.delete(provider);
}

export async function pullProvider(provider: AIProvider, options: { force?: boolean } = {}): Promise<void> {
  if (degraded.has(provider) && !options.force) return;
  const existing = pullInflight.get(provider);
  if (existing) {
    if (!options.force || existing.force) return existing.promise;
    await existing.promise;
    if (!pending.has(provider)) return;
  }
  const started = pullProviderInner(provider, options).finally(() => {
    if (pullInflight.get(provider)?.promise === started) pullInflight.delete(provider);
  });
  pullInflight.set(provider, { promise: started, force: options.force === true });
  return started;
}

async function pullProviderInner(provider: AIProvider, options: { force?: boolean }): Promise<void> {
  if (degraded.has(provider) && !options.force) return;
  const batch = await pullWithRetry(provider);
  if (!batch) {
    markDegraded(provider, 'pull_failed');
    return;
  }
  let maxMid = 0;
  let sawDone = false;
  const providerBoot = activeBoot.get(provider);
  for (const message of batch) {
    if (!message.bootId || typeof message.mid !== 'number' || !Number.isFinite(message.mid)) continue;
    if (providerBoot && message.bootId !== providerBoot) continue;
    maxMid = Math.max(maxMid, message.mid);
    const previous = lastConsumed.get(provider);
    if (!previous || previous.bootId !== message.bootId) {
      lastConsumed.set(provider, { bootId: message.bootId, mid: 0 });
    }
    const current = lastConsumed.get(provider);
    if (current && message.mid <= current.mid) continue;
    lastConsumed.set(provider, { bootId: message.bootId, mid: message.mid });
    if (message.action === 'RESPONSE_DONE') sawDone = true;
    publish({ ...message, provider, transport: 'pull' });
  }
  if (maxMid > 0) {
    await host.provider.eval(provider, `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.ackBulk(${maxMid});`);
  }
  if (sawDone) setProviderAwaiting(provider, false);
}

function markDegraded(provider: AIProvider, reason: string): void {
  degraded.add(provider);
  clearDoneWatchdog(provider);
  const timer = pollTimers.get(provider);
  if (timer !== undefined) globalThis.clearInterval(timer);
  pollTimers.delete(provider);
  publish({
    v: 1,
    action: 'STATUS_REPORT',
    provider,
    payload: { bridge: 'degraded', reason },
    transport: 'local',
  });
}

function synthesizeDone(provider: AIProvider, payload: string): void {
  publish({
    v: 1,
    action: 'RESPONSE_DONE',
    provider,
    payload,
    transport: 'local',
  });
  setProviderAwaiting(provider, false);
}

function publish(message: BridgeMessage): void {
  publishBridgeMessage(message);
}

export async function pullWithRetry(provider: AIProvider): Promise<BridgeMessage[] | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await host.provider.evalWithCallback(
        provider,
        'window.__MAC_BRIDGE__ ? window.__MAC_BRIDGE__.peekOutbox() : []',
      );
      const parsed = parsePullResult(raw);
      if (!Array.isArray(parsed)) throw new Error('pull result is not an array');
      return parsed as BridgeMessage[];
    } catch {
      if (attempt === 0) await sleep(1000);
    }
  }
  return null;
}

export function parsePullResult(raw: string): unknown {
  const parsed = JSON.parse(raw) as unknown;
  return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export function resetBridgePullForTests(): void {
  lastConsumed.clear();
  pending.clear();
  degraded.clear();
  activeBoot.clear();
  awaitingSince.clear();
  pullInflight.clear();
  for (const timer of pollTimers.values()) globalThis.clearInterval(timer);
  pollTimers.clear();
  for (const timer of doneTimers.values()) globalThis.clearTimeout(timer);
  doneTimers.clear();
}
