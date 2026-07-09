import type { KeyboardEvent } from 'react';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { resetProviderBootState } from '../bridge/pull';
import { host } from '../host';
import { useI18n } from '../i18n/context';
import { formatI18n } from '../i18n/t';
import { buildAdapterPermissionSummary, type AdapterPermissionSummary } from './adapterPermissions';
import type { PresentationByProvider, WebviewPresentationState } from './presentation';
import { chipState } from './providerChipState';

export type CenterSurface = 'text' | 'native';

export function FocusPane({
  centeredProvider,
  sideProviders,
  chipProviders,
  states,
  presentation,
  centerSurface,
  centerText,
  centerTextFinal,
  userHidden,
  presentationHidden,
  setPaneRef,
  setCenterStageRef,
  openProvider,
  togglePaneVisibility,
  changeProviderPresentation,
  onManualFocusControl,
  accessProvider,
  toggleAdapterAccess,
  onEnlargeCenter,
  onCollapseCenter,
  onOpenLogin,
  syncBounds,
  reportProvider,
  reportBusy,
}: {
  centeredProvider?: AIProvider;
  sideProviders: AIProvider[];
  chipProviders: AIProvider[];
  states: Record<AIProvider, ProviderState>;
  presentation: PresentationByProvider;
  centerSurface: CenterSurface;
  centerText?: string;
  centerTextFinal: boolean;
  userHidden: ReadonlySet<AIProvider>;
  presentationHidden: ReadonlySet<AIProvider>;
  setPaneRef: (provider: AIProvider, el: HTMLDivElement | null) => void;
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  openProvider: (provider: AIProvider) => Promise<void>;
  togglePaneVisibility: (provider: AIProvider) => Promise<void>;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  onManualFocusControl: (provider: AIProvider) => void;
  accessProvider: AIProvider | null;
  toggleAdapterAccess: (provider: AIProvider) => void;
  onEnlargeCenter: () => void;
  onCollapseCenter: () => void;
  onOpenLogin: (provider: AIProvider) => Promise<void>;
  syncBounds: (provider: AIProvider) => Promise<void>;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
}) {
  const { t } = useI18n();
  const thumbnailProviders = [...sideProviders, ...chipProviders];

  return (
    <aside className="flex min-h-0 flex-1 flex-col bg-white dark:bg-zinc-950 p-3">
      {centeredProvider ? (
        <FocusStage
          provider={centeredProvider}
          state={states[centeredProvider]}
          centerSurface={centerSurface}
          centerText={centerText}
          centerTextFinal={centerTextFinal}
          hiddenByUser={userHidden.has(centeredProvider)}
          hiddenByCenter={presentationHidden.has(centeredProvider)}
          accessOpen={accessProvider === centeredProvider}
          setCenterStageRef={setCenterStageRef}
          openProvider={openProvider}
          togglePaneVisibility={togglePaneVisibility}
          changeProviderPresentation={changeProviderPresentation}
          onManualFocusControl={onManualFocusControl}
          toggleAdapterAccess={toggleAdapterAccess}
          onEnlargeCenter={onEnlargeCenter}
          onCollapseCenter={onCollapseCenter}
          onOpenLogin={onOpenLogin}
          syncBounds={syncBounds}
          reportProvider={reportProvider}
          reportBusy={reportBusy}
        />
      ) : (
        <section
          ref={setCenterStageRef}
          aria-label={t('provider.center')}
          className="min-h-[360px] flex-1 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
        />
      )}

      <section className="mt-3 shrink-0 overflow-x-auto overflow-y-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2">
        <div className="grid grid-flow-col gap-2" style={{ gridAutoColumns: 'minmax(0, 1fr)' }}>
          {thumbnailProviders.map((provider) => (
            <ThumbnailTile
              key={provider}
              provider={provider}
              state={states[provider]}
              presentation={presentation[provider]}
              hiddenByUser={userHidden.has(provider)}
              hiddenByCenter={presentationHidden.has(provider)}
              setPaneRef={setPaneRef}
              changeProviderPresentation={changeProviderPresentation}
              onManualFocusControl={onManualFocusControl}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}

function FocusStage({
  provider,
  state,
  centerSurface,
  centerText,
  centerTextFinal,
  hiddenByUser,
  hiddenByCenter,
  accessOpen,
  setCenterStageRef,
  openProvider,
  togglePaneVisibility,
  changeProviderPresentation,
  onManualFocusControl,
  toggleAdapterAccess,
  onEnlargeCenter,
  onCollapseCenter,
  onOpenLogin,
  syncBounds,
  reportProvider,
  reportBusy,
}: {
  provider: AIProvider;
  state: ProviderState;
  centerSurface: CenterSurface;
  centerText?: string;
  centerTextFinal: boolean;
  hiddenByUser: boolean;
  hiddenByCenter: boolean;
  accessOpen: boolean;
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  openProvider: (provider: AIProvider) => Promise<void>;
  togglePaneVisibility: (provider: AIProvider) => Promise<void>;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  onManualFocusControl: (provider: AIProvider) => void;
  toggleAdapterAccess: (provider: AIProvider) => void;
  onEnlargeCenter: () => void;
  onCollapseCenter: () => void;
  onOpenLogin: (provider: AIProvider) => Promise<void>;
  syncBounds: (provider: AIProvider) => Promise<void>;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
}) {
  const { locale, t } = useI18n();
  const permissionSummary = buildAdapterPermissionSummary(provider, undefined, locale);
  const hidden = hiddenByUser || hiddenByCenter;

  return (
    <section
      ref={setCenterStageRef}
      className="flex min-h-[360px] flex-1 flex-col overflow-hidden border border-sky-300 dark:border-sky-900 bg-zinc-50 dark:bg-zinc-900"
      onPointerDownCapture={() => onManualFocusControl(provider)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-sky-300 dark:border-sky-900 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">{AI_PROVIDERS[provider].name}</span>
        <div className="flex flex-wrap justify-end gap-2 text-xs">
          <button
            className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label={formatI18n(t('provider.access.aria'), { provider: AI_PROVIDERS[provider].name })}
            aria-expanded={accessOpen}
            aria-controls={`adapter-access-${provider}`}
            onClick={() => toggleAdapterAccess(provider)}
          >
            {t('provider.access')}
          </button>
          <button
            className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void togglePaneVisibility(provider);
            }}
            disabled={state.webview !== 'loaded' || hiddenByCenter}
          >
            {hiddenByCenter ? t('provider.hidden') : hiddenByUser ? t('provider.show') : t('provider.hide')}
          </button>
          {centerSurface === 'text' ? (
            <button className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onEnlargeCenter}>
              {t('provider.realPage')}
            </button>
          ) : (
            <button className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onCollapseCenter}>
              {t('provider.textView')}
            </button>
          )}
          <button className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => void changeProviderPresentation(provider, 'chip')}>
            {t('provider.chip')}
          </button>
          <button className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => void changeProviderPresentation(provider, 'side')}>
            {t('provider.side')}
          </button>
          <button className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => void onOpenLogin(provider)}>
            {t('provider.login')}
          </button>
          {provider === 'gemini' ? (
            <button className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => void host.provider.openLoginExternal(provider)}>
              {t('provider.browser')}
            </button>
          ) : null}
          <button
            className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              resetProviderBootState(provider);
              void host.provider.reload(provider).then(() => syncBounds(provider));
            }}
            disabled={state.webview !== 'loaded'}
          >
            {t('provider.reload')}
          </button>
          <button
            className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void reportProvider(provider)}
            disabled={reportBusy}
          >
            {t('provider.report')}
          </button>
        </div>
      </div>
      {accessOpen ? <AdapterAccessPanel id={`adapter-access-${provider}`} summary={permissionSummary} /> : null}
      {state.adapter === 'broken' ? (
        <div className="border-b border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-800 dark:text-red-200">{t('provider.adapterBroken')}</div>
      ) : null}
      {state.bridge === 'degraded' ? (
        <div className="border-b border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {t('provider.bridgeDegradedReload')}
        </div>
      ) : null}
      {provider === 'gemini' && state.login === 'blocked' ? (
        <div className="flex items-center justify-between gap-2 border-b border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>{t('provider.embeddedLoginBlocked')}</span>
          <button className="border border-amber-300 dark:border-amber-700 px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900" onClick={() => void host.provider.openLoginExternal(provider)}>
            {t('provider.openInBrowser')}
          </button>
        </div>
      ) : null}
      {centerSurface === 'text' ? (
        <TextCenterView thinking={state.thinking} centerText={centerText} centerTextFinal={centerTextFinal} />
      ) : state.webview === 'loaded' ? (
        <div className="grid flex-1 place-items-center p-3 text-xs text-zinc-500 dark:text-zinc-500">
          {hidden ? t('provider.nativeWebviewHidden') : t('provider.nativeWebviewCentered')}
        </div>
      ) : (
        <div className="grid flex-1 place-items-center">
          <button className="border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => void openProvider(provider)}>
            {t('provider.open')} {AI_PROVIDERS[provider].name}
          </button>
        </div>
      )}
    </section>
  );
}

export function TextCenterView({
  thinking,
  centerText,
  centerTextFinal,
}: {
  thinking: boolean;
  centerText?: string;
  centerTextFinal: boolean;
}) {
  const { t } = useI18n();
  if (thinking && !centerTextFinal) {
    return (
      <div className="grid flex-1 place-items-center p-3">
        <div className="whitespace-pre-wrap text-sm italic text-zinc-500 dark:text-zinc-500">{t('chat.thinking')}</div>
      </div>
    );
  }

  if (centerText) {
    return (
      <div className="flex-1 overflow-auto p-3 text-zinc-900 dark:text-zinc-100">
        <div className="whitespace-pre-wrap text-sm">{centerText}</div>
      </div>
    );
  }

  return <div className="grid flex-1 place-items-center p-3 text-sm text-zinc-500 dark:text-zinc-500">{t('provider.centerIdle')}</div>;
}

function ThumbnailTile({
  provider,
  state,
  presentation,
  hiddenByUser,
  hiddenByCenter,
  setPaneRef,
  changeProviderPresentation,
  onManualFocusControl,
}: {
  provider: AIProvider;
  state: ProviderState;
  presentation: WebviewPresentationState;
  hiddenByUser: boolean;
  hiddenByCenter: boolean;
  setPaneRef: (provider: AIProvider, el: HTMLDivElement | null) => void;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  onManualFocusControl: (provider: AIProvider) => void;
}) {
  const { t } = useI18n();
  const status = chipState(state, presentation, t);
  const hidden = hiddenByUser || hiddenByCenter;
  const focusProvider = () => {
    onManualFocusControl(provider);
    void changeProviderPresentation(provider, 'center');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    focusProvider();
  };

  return (
    <div
      ref={(el) => setPaneRef(provider, el)}
      role="button"
      tabIndex={0}
      aria-label={`${AI_PROVIDERS[provider].name}: ${status.label}`}
      className={`min-h-20 min-w-0 cursor-pointer border bg-zinc-50 dark:bg-zinc-900 p-2 outline-none transition-colors hover:border-sky-400 dark:hover:border-sky-700 focus:border-sky-500 dark:focus:border-sky-600 ${
        hidden ? 'border-zinc-300 dark:border-zinc-700' : 'border-zinc-200 dark:border-zinc-800'
      }`}
      onPointerDown={() => onManualFocusControl(provider)}
      onClick={focusProvider}
      onKeyDown={onKeyDown}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{AI_PROVIDERS[provider].name}</span>
        <span className={`w-fit max-w-full truncate border px-1.5 py-0.5 text-[11px] ${status.className}`}>{status.label}</span>
      </div>
    </div>
  );
}

function AdapterAccessPanel({ id, summary }: { id: string; summary: AdapterPermissionSummary }) {
  const { t } = useI18n();

  return (
    <section id={id} className="border-b border-sky-300 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-3 py-3 text-xs text-zinc-700 dark:text-zinc-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('provider.access.heading')}</h3>
        <span className="shrink-0 text-[11px] text-sky-700 dark:text-sky-200">{summary.providerName}</span>
      </div>
      <div className="grid gap-3">
        <PermissionGroup title={t('provider.access.readTitle')} lines={summary.reads} />
        <PermissionGroup title={t('provider.access.writeTitle')} lines={summary.writes} />
        <PermissionGroup title={t('provider.access.cannotTitle')} lines={summary.cannot} />
      </div>
      {summary.note ? <p className="mt-3 border-t border-sky-300 dark:border-sky-900 pt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">{summary.note}</p> : null}
    </section>
  );
}

function PermissionGroup({ title, lines }: { title: string; lines: AdapterPermissionSummary['reads'] }) {
  return (
    <section>
      <div className="mb-1 font-semibold uppercase text-zinc-900 dark:text-zinc-100">{title}</div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.title}>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{line.title}:</span> <span className="leading-relaxed text-zinc-600 dark:text-zinc-400">{line.detail}</span>
            {line.selectors ? (
              <ul className="mt-1 space-y-1 border-l border-zinc-300 dark:border-zinc-700 pl-2">
                {line.selectors.map((selector) => (
                  <li key={selector}>
                    <code className="break-all text-[11px] text-sky-700 dark:text-sky-200">{selector}</code>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
