import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
const listenMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

import { host } from '../host';

describe('host snapshot bindings', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it('wraps snapshot commands with Tauri invoke argument names', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await host.snapshot.save('snap-1.ok', '{"ok":true}');
    expect(invokeMock).toHaveBeenLastCalledWith('snapshot_save', {
      snapshotId: 'snap-1.ok',
      snapshotJson: '{"ok":true}',
    });

    invokeMock.mockResolvedValueOnce([{ id: 'snap-1.ok', graphId: 'debate' }]);
    await expect(host.snapshot.list()).resolves.toEqual([{ id: 'snap-1.ok', graphId: 'debate' }]);
    expect(invokeMock).toHaveBeenLastCalledWith('snapshot_list');

    invokeMock.mockResolvedValueOnce('{"ok":true}');
    await expect(host.snapshot.load('snap-1.ok')).resolves.toBe('{"ok":true}');
    expect(invokeMock).toHaveBeenLastCalledWith('snapshot_load', { snapshotId: 'snap-1.ok' });

    invokeMock.mockResolvedValueOnce(undefined);
    await host.snapshot.delete('snap-1.ok');
    expect(invokeMock).toHaveBeenLastCalledWith('snapshot_delete', { snapshotId: 'snap-1.ok' });
  });

  it('rejects unsafe snapshot ids before invoke', async () => {
    await expect(host.snapshot.load('../secret')).rejects.toThrow('Invalid snapshot id');
    await expect(host.snapshot.delete('/tmp/secret')).rejects.toThrow('Invalid snapshot id');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('wraps session checkpoint commands with Tauri invoke argument names', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await host.sessionCheckpoint.save('{"graphId":"free"}');
    expect(invokeMock).toHaveBeenLastCalledWith('session_checkpoint_save', {
      json: '{"graphId":"free"}',
    });

    invokeMock.mockResolvedValueOnce('{"graphId":"free"}');
    await expect(host.sessionCheckpoint.load()).resolves.toBe('{"graphId":"free"}');
    expect(invokeMock).toHaveBeenLastCalledWith('session_checkpoint_load');

    invokeMock.mockResolvedValueOnce(undefined);
    await host.sessionCheckpoint.clear();
    expect(invokeMock).toHaveBeenLastCalledWith('session_checkpoint_clear');
  });

  it('wraps provider draft fill as an outbound FILL_DRAFT eval', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await host.provider.fill('grok', 'draft text');

    expect(invokeMock).toHaveBeenLastCalledWith('provider_eval', {
      provider: 'grok',
      js: `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.dispatch(${JSON.stringify({
        v: 1,
        action: 'FILL_DRAFT',
        provider: 'grok',
        payload: { text: 'draft text' },
      })});`,
    });
    expect(String(invokeMock.mock.calls.at(-1)?.[1]?.js)).not.toContain('SEND_MESSAGE');
  });

  it('starts a fresh provider conversation through the dedicated host command', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await host.provider.newSession('chatgpt');

    expect(invokeMock).toHaveBeenLastCalledWith('provider_new_session', { provider: 'chatgpt' });
  });

  it.each(['chatgpt', 'claude', 'gemini', 'grok'] as const)('parks %s offscreen without stealing focus', async (provider) => {
    invokeMock.mockResolvedValue(undefined);
    const bounds = { x: -10_000, y: -10_000, width: 420, height: 320 } as DOMRectReadOnly;

    await host.provider.park(provider, bounds);

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'provider_set_bounds', {
      provider,
      bounds: { x: -10_000, y: -10_000, width: 420, height: 320 },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'provider_show', { provider, focus: false });
  });

  it('subscribes to nav-blocked diagnostics and forwards the host-only payload', async () => {
    const unlisten = vi.fn();
    const handler = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);

    await expect(host.onNavBlocked(handler)).resolves.toBe(unlisten);

    expect(listenMock).toHaveBeenCalledWith('nav://blocked', expect.any(Function));
    const listener = listenMock.mock.calls[0][1] as (event: { payload: { provider: string; host: string } }) => void;
    listener({ payload: { provider: 'chatgpt', host: 'auth.openai.com' } });

    expect(handler).toHaveBeenCalledWith({ provider: 'chatgpt', host: 'auth.openai.com' });
  });
});
