import type { ReactNode } from 'react';
import type { ChatMode } from '../../shared/types';
import type { I18nKey } from '../i18n/keys';
import { t } from '../i18n/t';
import type { Locale } from '../i18n/resolve';
import { PRESET_CATALOG, type PresetCatalogEntry } from './presetCatalogData';

export function PresetCatalog({
  mode,
  onSelectPreset,
  advancedOpen,
  onAdvancedOpenChange,
  locale = 'en',
  visiblePresetCount = PRESET_CATALOG.length,
  showFullCatalogInAdvanced = false,
  moreLabelKey = 'preset.more',
  advancedClosedLabelKey = 'preset.showRawControls',
  advancedOpenLabelKey = 'preset.hideRawControls',
  children,
}: {
  mode: ChatMode;
  onSelectPreset: (mode: ChatMode) => void;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  locale?: Locale;
  visiblePresetCount?: number;
  showFullCatalogInAdvanced?: boolean;
  moreLabelKey?: I18nKey;
  advancedClosedLabelKey?: I18nKey;
  advancedOpenLabelKey?: I18nKey;
  children?: ReactNode;
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

      <div className="border border-zinc-800 bg-zinc-950">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-900"
          aria-expanded={advancedOpen}
          aria-controls="advanced-workflow-controls"
          onClick={() => onAdvancedOpenChange(!advancedOpen)}
        >
          <span>{t(moreLabelKey, locale)}</span>
          <span className="text-zinc-500">{advancedOpen ? t(advancedOpenLabelKey, locale) : t(advancedClosedLabelKey, locale)}</span>
        </button>
        <div id="advanced-workflow-controls" hidden={!advancedOpen} className="border-t border-zinc-800 p-3">
          {showFullCatalogInAdvanced ? (
            renderPresetGrid({
              presets: PRESET_CATALOG,
              mode,
              onSelectPreset,
              locale,
              className: 'mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5',
              keyPrefix: 'advanced',
            })
          ) : null}
          {children}
        </div>
      </div>
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
            className={`flex min-h-36 flex-col border p-3 text-left transition ${
              selected ? 'border-sky-500 bg-sky-950 text-zinc-50' : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
            }`}
            aria-pressed={selected}
          >
            <span className="text-sm font-semibold">{displayName}</span>
            <span className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{t(preset.descriptionKey, locale)}</span>
            <span className="mt-3 border-t border-zinc-800 pt-2 text-[11px] font-medium text-sky-200">
              {t(preset.costLabelKey, locale)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
