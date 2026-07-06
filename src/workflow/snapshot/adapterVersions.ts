import { AI_PROVIDERS } from '../../../shared/constants';
import type { AIProvider, BridgeMessage } from '../../../shared/types';
import { onBridgeMessage } from '../../bridge/bus';
import type { AIProviderV2 } from './types';

const adapterVersions = new Map<AIProvider, number>();
let unsubscribe: (() => void) | undefined;

export function getSnapshotAdapterVersions(
  providers: Iterable<AIProviderV2>,
): Partial<Record<AIProviderV2, number>> {
  ensureAdapterVersionTracking();
  const versions: Partial<Record<AIProviderV2, number>> = {};
  for (const provider of providers) {
    if (!isAIProvider(provider)) continue;
    const version = adapterVersions.get(provider);
    if (version !== undefined) versions[provider] = version;
  }
  return versions;
}

export function resetAdapterVersionsForTests(): void {
  unsubscribe?.();
  unsubscribe = undefined;
  adapterVersions.clear();
  ensureAdapterVersionTracking();
}

function ensureAdapterVersionTracking(): void {
  if (unsubscribe) return;
  unsubscribe = onBridgeMessage(handleBridgeMessage);
}

function handleBridgeMessage(message: BridgeMessage): void {
  if (message.action !== 'ADAPTER_UPDATE') return;
  if (!message.provider || !isAIProvider(message.provider)) return;
  const payload = message.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const version = (payload as { adapterVersion?: unknown }).adapterVersion;
  if (typeof version !== 'number' || !Number.isFinite(version)) return;
  adapterVersions.set(message.provider, version);
}

function isAIProvider(provider: string): provider is AIProvider {
  return provider in AI_PROVIDERS;
}

ensureAdapterVersionTracking();
