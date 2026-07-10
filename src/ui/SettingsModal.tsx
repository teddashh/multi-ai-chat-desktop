import { useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { buildAdapterPermissionSummary } from './adapterPermissions';
import { AdapterAccessPanel } from './FocusPane';
import { useI18n } from '../i18n/context';
import { formatI18n } from '../i18n/t';
import type { PresentationByProvider } from './presentation';
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
import { ModalDialog } from './ModalDialog';

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

type UpdateCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; tagName: string; htmlUrl: string }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

interface SettingsError {
  messageKey: 'settings.loadFailed' | 'settings.saveFailed';
  detail?: string;
}

export function SettingsModal({
  open,
  openProviders,
  focusPaneWidth,
  presentation,
  providerStates,
  onClose,
  onSaved,
}: {
  open: boolean;
  openProviders: AIProvider[];
  focusPaneWidth: number;
  presentation: PresentationByProvider;
  providerStates: Record<AIProvider, ProviderState>;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
}) {
  const { t, setLanguage } = useI18n();
  const [draft, setDraft] = useState<AppSettings | undefined>();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<SettingsError | undefined>();
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({ status: 'idle' });
  const loadedRef = useRef<AppSettings | undefined>();
  const closeTimerRef = useRef<number | undefined>();
  const liveRef = useRef({ openProviders, focusPaneWidth, presentation });
  liveRef.current = { openProviders, focusPaneWidth, presentation };

  useEffect(() => {
    if (!open) return;
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    let disposed = false;
    setDraft(undefined);
    setSaved(false);
    setError(undefined);
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
          openProviders: live.openProviders,
          focusPaneWidth: live.focusPaneWidth,
          presentation: live.presentation,
        });
      })
      .catch((reason: unknown) => {
        if (disposed) return;
        setError({ messageKey: 'settings.loadFailed', detail: errorDetail(reason) });
        const fallback = normalizeSettings({});
        const live = liveRef.current;
        loadedRef.current = fallback;
        setDraft({
          ...fallback,
          openProviders: live.openProviders,
          focusPaneWidth: live.focusPaneWidth,
          presentation: live.presentation,
        });
      });
    return () => {
      disposed = true;
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (!open) return null;

  const updateDraft = (patch: Partial<AppSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updateLanguage = async (language: AppSettings['language']) => {
    const previousLanguage = loadedRef.current?.language ?? 'system';
    setError(undefined);
    updateDraft({ language });
    setLanguage(language);
    const live = liveRef.current;
    const next = mergeSettings(loadedRef.current, {
      language,
      openProviders: live.openProviders,
      focusPaneWidth: live.focusPaneWidth,
      presentation: live.presentation,
    });
    try {
      await host.settings.set(next);
      loadedRef.current = next;
      onSaved(next);
    } catch (reason) {
      updateDraft({ language: previousLanguage });
      setLanguage(previousLanguage);
      setError({ messageKey: 'settings.saveFailed', detail: errorDetail(reason) });
    }
  };

  const save = async () => {
    if (!draft) return;
    setError(undefined);
    const next = mergeSettings(loadedRef.current, {
      ...draft,
      openProviders,
      focusPaneWidth,
      presentation,
    });
    try {
      await host.settings.set(next);
      loadedRef.current = next;
      onSaved(next);
      setSaved(true);
      closeTimerRef.current = window.setTimeout(onClose, 400);
    } catch (reason) {
      setError({ messageKey: 'settings.saveFailed', detail: errorDetail(reason) });
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
    <ModalDialog
      titleId="settings-title"
      onEscape={onClose}
      onBackdrop={onClose}
      panelClassName="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-zinc-300 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
    >
        <div className="mb-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <h2 id="settings-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t('settings.title')}</h2>
          <button type="button" className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onClose}>
            {t('settings.close')}
          </button>
        </div>

        {draft ? (
          <div className="space-y-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('settings.general')}</h3>
            <section>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">{t('settings.language')}</span>
                <select
                  value={draft.language}
                  onChange={(event) => {
                    void updateLanguage(event.target.value as AppSettings['language']);
                  }}
                  className="w-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-sky-500 dark:focus:border-sky-600"
                >
                  <option value="system">{t('settings.language.system')}</option>
                  <option value="en">{t('settings.language.en')}</option>
                  <option value="zh-TW">{t('settings.language.zhTW')}</option>
                </select>
              </label>
            </section>

            <section>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">{t('settings.theme')}</span>
                <select
                  value={draft.theme}
                  onChange={(event) => updateDraft({ theme: event.target.value as AppSettings['theme'] })}
                  className="w-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-sky-500 dark:focus:border-sky-600"
                >
                  <option value="light">{t('settings.themeLight')}</option>
                  <option value="dark">{t('settings.themeDark')}</option>
                </select>
              </label>
            </section>

            <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('settings.privacyHistory')}</h3>
              <label className="flex items-start gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={draft.snapshotPersistence}
                  onChange={(event) => updateDraft({ snapshotPersistence: event.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-sky-700"
                />
                <span>
                  <span className="block font-medium text-zinc-700 dark:text-zinc-300">{t('settings.durableSnapshots')}</span>
                  <span className="mt-1 block leading-relaxed">
                    {t('settings.durableSnapshotsDescription')}
                  </span>
                </span>
              </label>
              <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                <span className="mb-1 block">{t('settings.snapshotRedactionTier')}</span>
                <select
                  value={draft.snapshotRedactionTier}
                  onChange={(event) =>
                    updateDraft({ snapshotRedactionTier: event.target.value as AppSettings['snapshotRedactionTier'] })
                  }
                  disabled={!draft.snapshotPersistence}
                  className="w-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-sky-500 dark:focus:border-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="metadata-only">metadata-only</option>
                  <option value="hashes">hashes</option>
                  <option value="prompt-text">prompt-text</option>
                  <option value="full-local">full-local</option>
                </select>
              </label>
            </section>

            {!draft.portable ? (
              <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <span className="block text-xs text-zinc-600 dark:text-zinc-400">{t('settings.updates')}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void checkForUpdates()}
                    disabled={updateCheck.status === 'checking'}
                  >
                    {updateCheck.status === 'checking' ? t('settings.checking') : t('settings.checkForUpdates')}
                  </button>
                  {updateCheck.status === 'up-to-date' ? (
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{t('settings.upToDate').replace('{version}', updateCheck.version)}</span>
                  ) : null}
                  {updateCheck.status === 'available' ? (
                    <span className="text-xs text-sky-700 dark:text-sky-300">
                      {t('settings.newVersionAvailable').replace('{version}', updateCheck.tagName)} {'->'}{' '}
                      <button
                        type="button"
                        className="underline hover:text-sky-800 dark:hover:text-sky-200"
                        onClick={() => void host.app.openExternal(updateCheck.htmlUrl)}
                      >
                        {t('settings.downloadPage')}
                      </button>
                    </span>
                  ) : null}
                  {updateCheck.status === 'unavailable' ? (
                    <span className="text-xs text-amber-700 dark:text-amber-300">{t('settings.releasesUnavailable')}</span>
                  ) : null}
                  {updateCheck.status === 'error' ? (
                    <span className="text-xs text-red-700 dark:text-red-300">{t('settings.updateCheckFailed')} {updateCheck.message}</span>
                  ) : null}
                </div>
              </section>
            ) : null}

            <details className="group border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <summary className="cursor-pointer list-none rounded px-1 py-2 focus-visible:outline-offset-2">
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('settings.advanced')}</span>
                    <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{t('settings.advancedDescription')}</span>
                  </span>
                  <span className="text-zinc-500 transition group-open:rotate-180" aria-hidden="true">⌄</span>
                </span>
              </summary>
              <div className="mt-3 space-y-4 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
                <section>
                  <label className="block text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="mb-1 block">{t('settings.adapterBaseUrl')}</span>
                    <input
                      value={draft.adapterBaseUrl}
                      onChange={(event) => updateDraft({ adapterBaseUrl: event.target.value })}
                      className="w-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-sky-500 dark:focus:border-sky-600"
                    />
                  </label>
                </section>
                <AccessTransparencySection />
                <DiagnosticsSection providerStates={providerStates} settings={draft} />
              </div>
            </details>

            <section className="border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs text-zinc-600 dark:text-zinc-400">{t('settings.telemetryNone')}</section>
          </div>
        ) : (
          <div className="py-8 text-sm text-zinc-500 dark:text-zinc-500">{t('settings.loading')}</div>
        )}

        {error ? (
          <div className="mt-4 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-800 dark:text-red-200" role="alert">
            <div>{t(error.messageKey)}</div>
            {error.detail ? (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">{t('settings.technicalDetails')}</summary>
                <code className="mt-1 block break-words text-[11px] opacity-80">{error.detail}</code>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <button type="button" className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={onClose}>
            {t('settings.cancel')}
          </button>
          <button
            type="button"
            className="min-w-16 border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950 px-3 py-1.5 text-sm text-sky-700 dark:text-sky-100 hover:bg-sky-100 dark:hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void save()}
            disabled={!draft}
          >
            {saved ? t('settings.saved') : t('settings.save')}
          </button>
        </div>
    </ModalDialog>
  );
}

type DebugBundleExportState =
  | { status: 'idle' }
  | { status: 'exporting' }
  | { status: 'saved'; message: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function AccessTransparencySection() {
  const { locale, t } = useI18n();
  const [provider, setProvider] = useState<AIProvider>(PROVIDERS[0]);
  const summary = useMemo(() => buildAdapterPermissionSummary(provider, undefined, locale), [locale, provider]);

  return (
    <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
      <div>
        <h3 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t('provider.access')}</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((candidate) => {
          const selected = candidate === provider;
          return (
            <button
              key={candidate}
              className={`border px-3 py-1.5 text-xs ${
                selected
                  ? 'border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950 text-sky-800 dark:text-sky-100'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              aria-pressed={selected}
              onClick={() => setProvider(candidate)}
            >
              {AI_PROVIDERS[candidate].name}
            </button>
          );
        })}
      </div>
      <AdapterAccessPanel id={`settings-adapter-access-${provider}`} summary={summary} />
    </section>
  );
}

function DiagnosticsSection({
  providerStates,
  settings,
}: {
  providerStates: Record<AIProvider, ProviderState>;
  settings: AppSettings;
}) {
  const { t } = useI18n();
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
      setExportState(saved ? { status: 'saved', message: formatI18n(t('share.exported'), { path: saved }) } : { status: 'cancelled' });
    } catch (reason) {
      setExportState({ status: 'error', message: reason instanceof Error ? reason.message : String(reason) });
    }
  };

  return (
    <section className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t('settings.diagnostics')}</h3>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{t('settings.diagnosticsDescription')}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            {t('settings.provider')}
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as EventLogProviderFilter)}
              className="border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-sky-500 dark:focus:border-sky-600"
            >
              <option value="all">{t('settings.all')}</option>
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {providerName(provider)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void copyLog()}
            disabled={filteredEvents.length === 0}
          >
            {copyState === 'copied' ? t('settings.copied') : copyState === 'error' ? t('settings.copyFailed') : t('settings.copyLog')}
          </button>
          <button
            className="border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void exportDebugBundle()}
            disabled={exportState.status === 'exporting'}
          >
            {exportState.status === 'exporting' ? t('settings.exporting') : t('settings.exportDebugBundle')}
          </button>
        </div>
      </div>

      {exportState.status === 'saved' ? (
        <div className="border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">{exportState.message}</div>
      ) : null}
      {exportState.status === 'cancelled' ? (
        <div className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{t('settings.exportCancelled')}</div>
      ) : null}
      {exportState.status === 'error' ? (
        <div className="border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-800 dark:text-red-200">
          {t('settings.exportFailed')} {exportState.message}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const state = providerStates[provider];
          const lastEvent = lastEventByProvider.get(provider);
          return (
            <div key={provider} className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{providerName(provider)}</span>
                <span className="text-zinc-500 dark:text-zinc-500">{lastEvent ? formatRelativeTime(lastEvent, now) : t('settings.noEvents')}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-600 dark:text-zinc-400">
                <StatusPair label={t('settings.bridge')} value={state.bridge ?? 'unknown'} />
                <StatusPair label={t('settings.adapter')} value={state.adapter ?? 'ok'} />
                <StatusPair label={t('settings.login')} value={state.login} />
                <StatusPair label={t('settings.dom')} value={state.dom} />
                <StatusPair label={t('settings.thinking')} value={state.thinking ? t('settings.yes') : t('settings.no')} />
                <StatusPair label={t('settings.webview')} value={state.webview} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-h-72 overflow-auto border border-zinc-200 dark:border-zinc-800">
        {recentEvents.length === 0 ? (
          <div className="p-3 text-xs text-zinc-500 dark:text-zinc-500">{t('settings.noDiagnosticEvents')}</div>
        ) : (
          <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
      <span className="text-zinc-500 dark:text-zinc-500">{label}: </span>
      <span className="break-words text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}

function EventLogRow({ event, now }: { event: EventLogEvent; now: number }) {
  return (
    <li className="px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-zinc-500 dark:text-zinc-500">
        <span>{formatRelativeTime(event.ts, now)}</span>
        <span className="border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 text-[11px] uppercase text-zinc-700 dark:text-zinc-300">{event.kind}</span>
        {event.provider ? <span className="text-sky-700 dark:text-sky-300">{providerName(event.provider)}</span> : null}
      </div>
      <div className="mt-1 break-words text-zinc-800 dark:text-zinc-200">{event.summary}</div>
      {event.detail ? <code className="mt-1 block break-words text-[11px] text-zinc-500 dark:text-zinc-500">{JSON.stringify(event.detail)}</code> : null}
    </li>
  );
}

function errorDetail(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
