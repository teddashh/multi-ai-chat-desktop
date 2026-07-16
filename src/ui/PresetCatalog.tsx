import type { AIProvider, ChatMode, ProviderState, WorkflowPresetId } from '../../shared/types';
import { formatI18n, t } from '../i18n/t';
import type { Locale } from '../i18n/resolve';
import { isSendable } from '../workflow/sendability';
import { PRESET_CATALOG, type PresetCatalogEntry } from './presetCatalogData';

export function PresetCatalog({
  mode,
  selectedPresetId,
  onSelectPreset,
  locale = 'en',
  visiblePresetCount = PRESET_CATALOG.length,
  states,
  disabled = false,
  detailsPresetId,
  layout = 'wide',
}: {
  mode: ChatMode;
  selectedPresetId?: WorkflowPresetId;
  onSelectPreset: (presetId: WorkflowPresetId) => void;
  locale?: Locale;
  visiblePresetCount?: number;
  states?: Record<AIProvider, ProviderState>;
  disabled?: boolean;
  detailsPresetId?: WorkflowPresetId;
  layout?: 'wide' | 'sidebar';
}) {
  const visiblePresets = PRESET_CATALOG.slice(0, visiblePresetCount);
  const quickMode = visiblePresetCount < PRESET_CATALOG.length;
  const activePresetId = selectedPresetId ?? mode;
  const detailPreset = PRESET_CATALOG.find((preset) => preset.id === detailsPresetId);
  return (
    <section aria-label={t('preset.catalog.aria', locale)} className="space-y-2">
      {renderPresetGrid({
        presets: visiblePresets,
        onSelectPreset,
        locale,
        states,
        disabled,
        compact: layout === 'sidebar',
        className:
          layout === 'sidebar'
            ? 'grid grid-cols-2 gap-1.5'
            : quickMode
              ? 'grid gap-2 lg:grid-cols-3'
              : 'grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
        activePresetId,
      })}
      {detailPreset ? (
        <div className="ai-sister-preset-detail flex flex-wrap items-start justify-between gap-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs dark:border-sky-900 dark:bg-sky-950/30">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sky-900 dark:text-sky-100">{t(detailPreset.displayNameKey, locale)}</div>
            <p className="mt-1 leading-relaxed text-zinc-700 dark:text-zinc-300">{t(detailPreset.descriptionKey, locale)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[0.6875rem] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            {t(detailPreset.costLabelKey, locale)}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function renderPresetGrid({
  presets,
  onSelectPreset,
  locale,
  states,
  disabled,
  className,
  compact = false,
  activePresetId,
  keyPrefix = 'preset',
}: {
  presets: PresetCatalogEntry[];
  onSelectPreset: (presetId: WorkflowPresetId) => void;
  locale: Locale;
  states?: Record<AIProvider, ProviderState>;
  disabled: boolean;
  className: string;
  compact?: boolean;
  activePresetId: WorkflowPresetId;
  keyPrefix?: string;
}) {
  return (
    <div className={className}>
      {presets.map((preset) => {
        const selected = activePresetId === preset.id;
        const displayName = t(preset.displayNameKey, locale);
        const readiness = states ? presetReadiness(preset, states, locale) : undefined;
        return (
          <button
            key={`${keyPrefix}-${preset.id}`}
            type="button"
            onClick={() => onSelectPreset(preset.id)}
            disabled={disabled}
            className={`ai-sister-preset-card flex ${compact ? 'min-h-12 px-2 py-1.5' : 'min-h-14 px-3 py-2'} flex-col justify-center rounded border text-left transition ${
              selected ? 'border-sky-500 bg-sky-50 dark:bg-sky-950 text-sky-900 dark:text-zinc-50' : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            aria-pressed={selected}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{displayName}</span>
              {readiness ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${
                    readiness.ready
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {readiness.label}
                </span>
              ) : null}
            </span>
            {preset.metaKey ? <span className="mt-1 text-[0.6875rem] leading-none text-zinc-500 dark:text-zinc-400">{t(preset.metaKey, locale)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function presetReadiness(
  preset: PresetCatalogEntry,
  states: Record<AIProvider, ProviderState>,
  locale: Locale,
): { label: string; ready: boolean } {
  const required = preset.requiredProviders;
  if (required.length === 0) {
    const readyCount = (Object.keys(states) as AIProvider[]).filter((provider) => isSendable(states[provider])).length;
    return {
      label: formatI18n(t('preset.readinessAny', locale), { ready: readyCount }),
      ready: readyCount > 0,
    };
  }

  const readyCount = required.filter((provider) => isSendable(states[provider])).length;
  return {
    label: formatI18n(t('preset.readinessRequired', locale), { ready: readyCount, total: required.length }),
    ready: readyCount === required.length,
  };
}
