import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestRelease } from '../ui/updateCheck';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchLatestRelease abort signal', () => {
  it('skips fetch when the signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchLatestRelease(undefined, controller.signal)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the signal to fetch and resolves null on abort', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = fetchLatestRelease(undefined, controller.signal);
    controller.abort();
    await expect(pending).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('does not start fetch when aborted between version and release lookup', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const isCurrent = () => !controller.signal.aborted;
    controller.abort();
    if (isCurrent()) await fetchLatestRelease(undefined, controller.signal);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SettingsModal update-check abort wiring', () => {
  it('aborts on close/unmount cleanup and passes signal into fetchLatestRelease', () => {
    const source = readFileSync(new URL('../ui/SettingsModal.tsx', import.meta.url), 'utf8');
    expect(source).toContain('updateCheckAbortRef');
    expect(source).toContain('updateCheckAbortRef.current?.abort()');
    expect(source).toContain('fetchLatestRelease(undefined, controller.signal)');
    expect(source).toMatch(/return \(\) => \{[\s\S]*updateCheckAbortRef\.current\?\.abort\(\);/);
  });
});
