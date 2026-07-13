import { describe, expect, it, vi } from 'vitest';
import { createSettingsPersistence } from '../ui/settingsPersistence';
import { defaultSettings, type AppSettings } from '../ui/settingsModel';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function storeWith(settings: AppSettings) {
  let persisted = settings;
  const commit = async (next: unknown) => {
    persisted = next as AppSettings;
  };
  return {
    get: vi.fn(async () => persisted),
    set: vi.fn(commit),
    commit,
  };
}

describe('settings persistence', () => {
  it('persists rapid font-size updates in order so the last input wins', async () => {
    const initial = defaultSettings();
    const store = storeWith(initial);
    const firstWrite = deferred<void>();
    store.set.mockImplementationOnce(async (next: unknown) => {
      await firstWrite.promise;
      await store.commit(next);
    });
    const persistence = createSettingsPersistence(store);
    persistence.replaceCurrent(initial);

    const first = persistence.update({ fontSize: 18 });
    const second = persistence.update({ fontSize: 20 });

    await vi.waitFor(() => expect(store.set).toHaveBeenCalledTimes(1));
    expect((store.set.mock.calls[0][0] as AppSettings).fontSize).toBe(18);
    firstWrite.resolve();
    await Promise.all([first, second]);

    expect(store.set.mock.calls.map(([settings]) => (settings as AppSettings).fontSize)).toEqual([18, 20]);
    expect(persistence.current()?.fontSize).toBe(20);
  });

  it('continues with the latest update after an earlier write fails', async () => {
    const initial = defaultSettings();
    const store = storeWith(initial);
    store.set.mockRejectedValueOnce(new Error('write failed'));
    const persistence = createSettingsPersistence(store);
    persistence.replaceCurrent(initial);

    const first = persistence.update({ fontSize: 18 });
    const second = persistence.update({ fontSize: 20 });

    await expect(first).rejects.toThrow('write failed');
    await expect(second).resolves.toMatchObject({ fontSize: 20 });
    expect(store.set).toHaveBeenCalledTimes(2);
    expect(persistence.current()?.fontSize).toBe(20);
  });

  it('builds a queued patch from the most recently committed settings', async () => {
    const initial = defaultSettings();
    const store = storeWith(initial);
    const firstWrite = deferred<void>();
    store.set.mockImplementationOnce(async () => firstWrite.promise);
    const persistence = createSettingsPersistence(store);
    persistence.replaceCurrent(initial);

    const language = persistence.update({ language: 'ja', responseLanguage: 'de' });
    const fontSize = persistence.update({ fontSize: 20 });
    await vi.waitFor(() => expect(store.set).toHaveBeenCalledTimes(1));
    firstWrite.resolve();
    await Promise.all([language, fontSize]);

    expect(store.set.mock.calls[1][0]).toMatchObject({ language: 'ja', responseLanguage: 'de', fontSize: 20 });
  });

  it('waits for a pending write before loading settings again', async () => {
    const initial = defaultSettings();
    const store = storeWith(initial);
    const firstWrite = deferred<void>();
    store.set.mockImplementationOnce(async (next: unknown) => {
      await firstWrite.promise;
      await store.commit(next);
    });
    const persistence = createSettingsPersistence(store);
    persistence.replaceCurrent(initial);

    const update = persistence.update({ fontSize: 18 });
    const load = persistence.load();
    await vi.waitFor(() => expect(store.set).toHaveBeenCalledTimes(1));
    expect(store.get).not.toHaveBeenCalled();

    firstWrite.resolve();
    await update;
    await expect(load).resolves.toMatchObject({ fontSize: 18 });
    expect(store.get).toHaveBeenCalledTimes(1);
  });
});
