import { describe, expect, it } from 'vitest';
import type { ProviderState } from '../../shared/types';
import { mergePullBridgeState } from '../appBridgeState';

const rustOk: ProviderState = {
  provider: 'chatgpt',
  webview: 'loaded',
  dom: 'ready',
  login: 'logged_in',
  thinking: false,
  lastStatusAt: 1,
  bridge: 'ok',
};

describe('App bridge state merge', () => {
  it('keeps pull-layer degraded authoritative over a Rust ok heartbeat until pull recovery', () => {
    const degraded = mergePullBridgeState(rustOk, { bridge: 'degraded', reason: 'pull_failed' });
    expect(degraded.bridge).toBe('degraded');
    expect(degraded.bridgeReason).toBe('pull_failed');
    expect(degraded.dom).toBe('ready');

    const recovered = mergePullBridgeState(rustOk, undefined);
    expect(recovered.bridge).toBe('ok');
    expect(recovered.bridgeReason).toBeUndefined();
  });
});
