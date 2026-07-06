import type { ReactNode } from 'react';
import type { ChatMode } from '../../shared/types';
import { PRESET_CATALOG } from './presetCatalogData';

export function PresetCatalog({
  mode,
  onSelectPreset,
  advancedOpen,
  onAdvancedOpenChange,
  children,
}: {
  mode: ChatMode;
  onSelectPreset: (mode: ChatMode) => void;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <section aria-label="Preset catalog" className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {PRESET_CATALOG.map((preset) => {
          const selected = mode === preset.graphId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.graphId)}
              className={`flex min-h-36 flex-col border p-3 text-left transition ${
                selected ? 'border-sky-500 bg-sky-950 text-zinc-50' : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
              }`}
              aria-pressed={selected}
            >
              <span className="text-sm font-semibold">{preset.displayName}</span>
              <span className="mt-2 flex-1 text-xs leading-relaxed text-zinc-400">{preset.description}</span>
              <span className="mt-3 border-t border-zinc-800 pt-2 text-[11px] font-medium text-sky-200">{preset.costLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="border border-zinc-800 bg-zinc-950">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-900"
          aria-expanded={advancedOpen}
          aria-controls="advanced-workflow-controls"
          onClick={() => onAdvancedOpenChange(!advancedOpen)}
        >
          <span>More…</span>
          <span className="text-zinc-500">{advancedOpen ? 'Hide raw controls' : 'Show raw controls'}</span>
        </button>
        <div id="advanced-workflow-controls" hidden={!advancedOpen} className="border-t border-zinc-800 p-3">
          {children}
        </div>
      </div>
    </section>
  );
}
