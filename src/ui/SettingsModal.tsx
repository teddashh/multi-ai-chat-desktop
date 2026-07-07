import { useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS, DOCK_SLOT_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { DEFAULT_COLUMN_WIDTHS, type ColumnWidths } from './dockLayout';
import type { PresentationByProvider } from './presentation';
import { assignSlotProvider, SLOT_IDS, type SlotAssignment, type SlotId } from './slotAssignment';
import { type AppSettings, mergeSettings, normalizeSettings } from './settingsModel';
import { compareVersions, fetchLatestRelease } from './updateCheck';
import { host } from '../host';
import {
  filterEventLogByProvider,
  formatEventLogText,
  formatRelativeTime,
  providerName,
  type EventLogEvent,
  type EventLogProviderFilter,
} from '../diagnostics/eventLog';
import { buildDebugBundle, debugBundleFilename } from '../diagnostics/debugBundle';
import { useEventLog } from './useEventLog';

const SLOT_LABELS: Record<SlotId, string> = {
  leftTop: 'Left top',
  leftBottom: 'Left bottom',
  rightTop: 'Right top',
  rightBottom: 'Right bottom',
};

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];
const DOCK_PROVIDERS = [...DOCK_SLOT_PROVIDERS] as AIProvider[];

type UpdateCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; tagName: string; htmlUrl: string }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export function SettingsModal({
  open,
  columnWidths,
  slotAssignment,
  openProviders,
  presentation,
  providerStates,
  onClose,
  onSaved,
}: {
  open: boolean;
  columnWidths: ColumnWidths;
  slotAssignment: SlotAssignment;
  openProviders: AIProvider[];
  presentation: PresentationByProvider;
  providerStates: Record<AIProvider, ProviderState>;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
}) {
  const [draft, setDraft] = useState<AppSettings | undefined>();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({ status: 'idle' });
  const loadedRef = useRef<AppSettings | undefined>();
  const liveRef = useRef({ columnWidths, slotAssignment, openProviders, presentation });
  liveRef.current = { columnWidths, slotAssignment, openProviders, presentation };

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    setDraft(undefined);
    setSaved(false);
    setError('');
    setUpdateCheck({ status: 'idle' });
    void host.settings
      .get()
      .then((value) => {
        if (disposed) return;
        const loaded = normalizeSettings(value);
        const live = liveRef.current;
        loadedRef.current = loaded;
        setDraft({
          ...loaded,
          columnWidths: live.columnWidths,
          slotAssignment: live.slotAssignment,
          openProviders: live.openProviders,
          presentation: live.presentation,
        });
      })
      .catch((reason: unknown) => {
        if (disposed) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        const fallback = normalizeSettings({});
        const live = liveRef.current;
        loadedRef.current = fallback;
        setDraft({
          ...fallback,
          columnWidths: live.columnWidths,
          slotAssignment: live.slotAssignment,
          openProviders: live.openProviders,
          presentation: live.presentation,
        });
      });
    return () => {
      disposed = true;
    };
  }, [open]);

  if (!open) return null;

  const updateDraft = (patch: Partial<AppSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updateSlot = (slot: SlotId, provider: AIProvider) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            slotAssignment: assignSlotProvider(current.slotAssignment, slot, provider),
          }
        : current,
    );
  };

  const save = async () => {
    if (!draft) return;
    setError('');
    const next = mergeSettings(loadedRef.current, {
      ...draft,
      openProviders,
      presentation,
    });
    try {
      await host.settings.set(next);
      loadedRef.current = next;
      onSaved(next);
      setSaved(true);
      window.setTimeout(onClose, 400);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const checkForUpdates = async () => {
    setUpdateCheck({ status: 'checking' });
    try {
      const currentVersion = await host.app.version();
      const latest = await fetchLatestRelease();
      if (!latest) {
        setUpdateCheck({ status: 'unavailable' });
        return;
      }
      if (compareVersions(currentVersion, latest.tagName)) {
        setUpdateCheck({ status: 'available', tagName: latest.tagName, htmlUrl: latest.htmlUrl });
      } else {
        setUpdateCheck({ status: 'up-to-date', version: currentVersion });
      }
    } catch (reason) {
      setUpdateCheck({ status: 'error', message: reason instanceof Error ? reason.message : String(reason) });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded border border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-base font-semibold text-zinc-100">Settings</h2>
          <button className="border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800" onClick={onClose}>
            Close
          </button>
        </div>

        {draft ? (
          <div className="space-y-5">
            <section>
              <label className="mb-1 block text-xs font-medium text-zinc-300">HackMD token</label>
              <input
                type="password"
                value={draft.hackmdToken}
                onChange={(event) => updateDraft({ hackmdToken: event.target.value })}
                placeholder="hmd_xxxxxxxxxxxxxxxx"
                className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-sky-600"
                autoFocus
              />
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                Token 以純文字存放於本機 settings.json，未加密
              </p>
            </section>

            <section>
              <div className="mb-2 text-xs font-medium text-zinc-300">Pane slots</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SLOT_IDS.map((slot) => (
                  <label key={slot} className="block text-xs text-zinc-400">
                    <span className="mb-1 block">{SLOT_LABELS[slot]}</span>
                    <select
                      value={draft.slotAssignment[slot]}
                      onChange={(event) => updateSlot(slot, event.target.value as AIProvider)}
                      className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600"
                    >
                      {DOCK_PROVIDERS.map((provider) => (
                        <option key={provider} value={provider}>
                          {AI_PROVIDERS[provider].name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-4">
              <div>
                <div className="text-xs font-medium text-zinc-300">Column widths</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Left {draft.columnWidths.left}px / Right {draft.columnWidths.right}px
                </div>
              </div>
              <button
                className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                onClick={() => updateDraft({ columnWidths: { ...DEFAULT_COLUMN_WIDTHS } })}
              >
                Reset layout
              </button>
            </section>

            <section className="grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2">
              <label className="block text-xs text-zinc-400">
                <span className="mb-1 block">Adapter channel</span>
                <input
                  value={draft.adapterChannel}
                  onChange={(event) => updateDraft({ adapterChannel: event.target.value })}
                  className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600"
                />
              </label>
              <label className="block text-xs text-zinc-400">
                <span className="mb-1 block">Adapter base URL</span>
                <input
                  value={draft.adapterBaseUrl}
                  onChange={(event) => updateDraft({ adapterBaseUrl: event.target.value })}
                  className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600"
                />
              </label>
            </section>

            <section className="space-y-3 border-t border-zinc-800 pt-4">
              <label className="flex items-start gap-3 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={draft.snapshotPersistence}
                  onChange={(event) => updateDraft({ snapshotPersistence: event.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-sky-700"
                />
                <span>
                  <span className="block font-medium text-zinc-300">Durable snapshots</span>
                  <span className="mt-1 block leading-relaxed">
                    Off by default. Stored locally under app data after redaction; never cookies or provider storage.
                  </span>
                </span>
              </label>
              <label className="block text-xs text-zinc-400">
                <span className="mb-1 block">Snapshot redaction tier</span>
                <select
                  value={draft.snapshotRedactionTier}
                  onChange={(event) =>
                    updateDraft({ snapshotRedactionTier: event.target.value as AppSettings['snapshotRedactionTier'] })
                  }
                  disabled={!draft.snapshotPersistence}
                  className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="metadata-only">metadata-only</option>
                  <option value="hashes">hashes</option>
                  <option value="prompt-text">prompt-text</option>
                  <option value="full-local">full-local</option>
                </select>
              </label>
            </section>

            {!draft.portable ? (
              <section className="space-y-3 border-t border-zinc-800 pt-4">
                <span className="block text-xs text-zinc-400">Updates</span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void checkForUpdates()}
                    disabled={updateCheck.status === 'checking'}
                  >
                    {updateCheck.status === 'checking' ? 'Checking...' : 'Check for updates'}
                  </button>
                  {updateCheck.status === 'up-to-date' ? (
                    <span className="text-xs text-zinc-400">You're up to date ({updateCheck.version}).</span>
                  ) : null}
                  {updateCheck.status === 'available' ? (
                    <span className="text-xs text-sky-300">
                      New version {updateCheck.tagName} available {'->'}{' '}
                      <button
                        type="button"
                        className="underline hover:text-sky-200"
                        onClick={() => void host.app.openExternal(updateCheck.htmlUrl)}
                      >
                        download page
                      </button>
                    </span>
                  ) : null}
                  {updateCheck.status === 'unavailable' ? (
                    <span className="text-xs text-amber-300">Could not check releases. Try again later.</span>
                  ) : null}
                  {updateCheck.status === 'error' ? (
                    <span className="text-xs text-red-300">Update check failed: {updateCheck.message}</span>
                  ) : null}
                </div>
              </section>
            ) : null}

            <DiagnosticsSection providerStates={providerStates} settings={draft} />

            <section className="border-t border-zinc-800 pt-4 text-xs text-zinc-400">telemetry: none</section>
          </div>
        ) : (
          <div className="py-8 text-sm text-zinc-500">Loading settings...</div>
        )}

        {error ? <div className="mt-4 border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div> : null}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
          <button className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            Cancel
          </button>
          <button
            className="min-w-16 border border-sky-700 bg-sky-950 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void save()}
            disabled={!draft}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

type DebugBundleExportState =
  | { status: 'idle' }
  | { status: 'exporting' }
  | { status: 'saved'; message: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function DiagnosticsSection({
  providerStates,
  settings,
}: {
  providerStates: Record<AIProvider, ProviderState>;
  settings: AppSettings;
}) {
  const events = useEventLog();
  const [providerFilter, setProviderFilter] = useState<EventLogProviderFilter>('all');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [exportState, setExportState] = useState<DebugBundleExportState>({ status: 'idle' });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (exportState.status === 'idle' || exportState.status === 'exporting') return;
    const timer = window.setTimeout(() => setExportState({ status: 'idle' }), 5000);
    return () => window.clearTimeout(timer);
  }, [exportState]);

  const lastEventByProvider = useMemo(() => {
    const map = new Map<AIProvider, number>();
    for (const event of events) {
      if (event.provider) map.set(event.provider, event.ts);
    }
    return map;
  }, [events]);

  const filteredEvents = useMemo(() => filterEventLogByProvider(events, providerFilter), [events, providerFilter]);
  const recentEvents = useMemo(() => [...filteredEvents].reverse().slice(0, 120), [filteredEvents]);

  const copyLog = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(formatEventLogText(filteredEvents));
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  const exportDebugBundle = async () => {
    setExportState({ status: 'exporting' });
    try {
      const generatedAt = new Date();
      const bundle = buildDebugBundle({
        appVersion: await host.app.version(),
        timestampMs: generatedAt.getTime(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        providerStates,
        settings,
        events,
      });
      const saved = await host.share.exportMarkdown(debugBundleFilename(generatedAt), bundle);
      setExportState(saved ? { status: 'saved', message: `Exported: ${saved}` } : { status: 'cancelled' });
    } catch (reason) {
      setExportState({ status: 'error', message: reason instanceof Error ? reason.message : String(reason) });
    }
  };

  return (
    <section className="space-y-3 border-t border-zinc-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium text-zinc-300">Diagnostics</h3>
          <div className="mt-1 text-xs text-zinc-500">In-memory event log. Copy before closing the app.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Provider
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as EventLogProviderFilter)}
              className="border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-sky-600"
            >
              <option value="all">All</option>
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {providerName(provider)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void copyLog()}
            disabled={filteredEvents.length === 0}
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy log'}
          </button>
          <button
            className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void exportDebugBundle()}
            disabled={exportState.status === 'exporting'}
          >
            {exportState.status === 'exporting' ? 'Exporting...' : 'Export debug bundle'}
          </button>
        </div>
      </div>

      {exportState.status === 'saved' ? (
        <div className="border border-emerald-900 bg-emerald-950 px-3 py-2 text-xs text-emerald-200">{exportState.message}</div>
      ) : null}
      {exportState.status === 'cancelled' ? (
        <div className="border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">Export cancelled.</div>
      ) : null}
      {exportState.status === 'error' ? (
        <div className="border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">Export failed: {exportState.message}</div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const state = providerStates[provider];
          const lastEvent = lastEventByProvider.get(provider);
          return (
            <div key={provider} className="border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-100">{providerName(provider)}</span>
                <span className="text-zinc-500">{lastEvent ? formatRelativeTime(lastEvent, now) : 'no events'}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-400">
                <StatusPair label="Bridge" value={state.bridge ?? 'unknown'} />
                <StatusPair label="Adapter" value={state.adapter ?? 'ok'} />
                <StatusPair label="Login" value={state.login} />
                <StatusPair label="DOM" value={state.dom} />
                <StatusPair label="Thinking" value={state.thinking ? 'yes' : 'no'} />
                <StatusPair label="Webview" value={state.webview} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-h-72 overflow-auto border border-zinc-800">
        {recentEvents.length === 0 ? (
          <div className="p-3 text-xs text-zinc-500">No diagnostic events yet.</div>
        ) : (
          <ol className="divide-y divide-zinc-800">
            {recentEvents.map((event, index) => (
              <EventLogRow key={`${event.ts}-${index}-${event.kind}-${event.summary}`} event={event} now={now} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function StatusPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-zinc-500">{label}: </span>
      <span className="break-words text-zinc-200">{value}</span>
    </div>
  );
}

function EventLogRow({ event, now }: { event: EventLogEvent; now: number }) {
  return (
    <li className="px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-zinc-500">
        <span>{formatRelativeTime(event.ts, now)}</span>
        <span className="border border-zinc-700 px-1.5 py-0.5 text-[11px] uppercase text-zinc-300">{event.kind}</span>
        {event.provider ? <span className="text-sky-300">{providerName(event.provider)}</span> : null}
      </div>
      <div className="mt-1 break-words text-zinc-200">{event.summary}</div>
      {event.detail ? <code className="mt-1 block break-words text-[11px] text-zinc-500">{JSON.stringify(event.detail)}</code> : null}
    </li>
  );
}
