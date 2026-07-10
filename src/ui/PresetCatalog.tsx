import type { ChatMode } from '../../shared/types';
import { t } from '../i18n/t';
import type { Locale } from '../i18n/resolve';
import { PRESET_CATALOG, type PresetCatalogEntry } from './presetCatalogData';

export function PresetCatalog({
  mode,
  onSelectPreset,
  locale = 'en',
  visiblePresetCount = PRESET_CATALOG.length,
}: {
  mode: ChatMode;
  onSelectPreset: (mode: ChatMode) => void;
  locale?: Locale;
  visiblePresetCount?: number;
}) {
  const visiblePresets = PRESET_CATALOG.slice(0, visiblePresetCount);
  const quickMode = visiblePresetCount < PRESET_CATALOG.length;
  return (
    <section aria-label={t('preset.catalog.aria', locale)} className="space-y-3">
      {renderPresetGrid({
        presets: visiblePresets,
        mode,
        onSelectPreset,
        locale,
        className: quickMode ? 'grid gap-2 lg:grid-cols-3' : 'grid gap-2 md:grid-cols-2 xl:grid-cols-5',
      })}
    </section>
  );
}

function renderPresetGrid({
  presets,
  mode,
  onSelectPreset,
  locale,
  className,
  keyPrefix = 'preset',
}: {
  presets: PresetCatalogEntry[];
  mode: ChatMode;
  onSelectPreset: (mode: ChatMode) => void;
  locale: Locale;
  className: string;
  keyPrefix?: string;
}) {
  return (
    <div className={className}>
      {presets.map((preset) => {
        const selected = mode === preset.graphId;
        const displayName = t(preset.displayNameKey, locale);
        return (
          <button
            key={`${keyPrefix}-${preset.id}`}
            type="button"
            onClick={() => onSelectPreset(preset.graphId)}
            className={`flex min-h-20 flex-col border p-3 text-left transition ${
              selected ? 'border-sky-500 bg-sky-50 dark:bg-sky-950 text-sky-900 dark:text-zinc-50' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600'
            }`}
            aria-pressed={selected}
          >
            <span className="text-sm font-semibold">{displayName}</span>
            {preset.metaKey ? <span className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{t(preset.metaKey, locale)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
