import { createSerialTaskQueue } from './serialTaskQueue';
import { type AppSettings, mergeSettings, normalizeSettings } from './settingsModel';

interface SettingsStore {
  get: () => Promise<unknown>;
  set: (settings: unknown) => Promise<void>;
}

export type SettingsPatch = Partial<AppSettings> | (() => Partial<AppSettings>);

export function createSettingsPersistence(store: SettingsStore) {
  const enqueue = createSerialTaskQueue();
  let current: AppSettings | undefined;

  return {
    load: (): Promise<AppSettings> =>
      enqueue(async () => {
        const loaded = normalizeSettings(await store.get());
        current = loaded;
        return loaded;
      }),

    update: (patch: SettingsPatch): Promise<AppSettings> =>
      enqueue(async () => {
        const resolvedPatch = typeof patch === 'function' ? patch() : patch;
        const next = mergeSettings(current, resolvedPatch);
        await store.set(next);
        current = next;
        return next;
      }),

    replaceCurrent: (settings: AppSettings): void => {
      current = settings;
    },

    current: (): AppSettings | undefined => current,
  };
}
