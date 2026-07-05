import type { ProviderState } from '../shared/types';

export type PullBridgeState = { bridge: 'degraded'; reason?: string };

export function mergePullBridgeState(state: ProviderState, pullBridge?: PullBridgeState): ProviderState {
  if (!pullBridge) return state;
  return { ...state, bridge: pullBridge.bridge, bridgeReason: pullBridge.reason };
}
