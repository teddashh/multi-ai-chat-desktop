import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { host } from '../host';

describe('host snapshot bindings', () => {
  beforeEach(() => {
    invokeMock.mockReset();
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
});
