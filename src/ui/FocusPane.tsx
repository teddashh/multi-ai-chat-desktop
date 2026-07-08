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

export function FocusPane({
  centeredProvider,
  sideProviders,
  chipProviders,
  states,
  presentation,
  userHidden,
  presentationHidden,
  setPaneRef,
  setCenterStageRef,
  openProvider,
  togglePaneVisibility,
  changeProviderPresentation,
  accessProvider,
  toggleAdapterAccess,
  syncBounds,
  reportProvider,
  reportBusy,
}: {
  centeredProvider?: AIProvider;
  sideProviders: AIProvider[];
  chipProviders: AIProvider[];
  states: Record<AIProvider, ProviderState>;
  presentation: PresentationByProvider;
  userHidden: ReadonlySet<AIProvider>;
  presentationHidden: ReadonlySet<AIProvider>;
  setPaneRef: (provider: AIProvider, el: HTMLDivElement | null) => void;
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  openProvider: (provider: AIProvider) => Promise<void>;
  togglePaneVisibility: (provider: AIProvider) => Promise<void>;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  accessProvider: AIProvider | null;
  toggleAdapterAccess: (provider: AIProvider) => void;
  syncBounds: (provider: AIProvider) => Promise<void>;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
}) {
  const { t } = useI18n();
  const thumbnailProviders = [...sideProviders, ...chipProviders];

  return (
    <aside className="flex min-h-0 flex-col border-r border-zinc-800 bg-zinc-950 p-3">
      {centeredProvider ? (
        <FocusStage
          provider={centeredProvider}
          state={states[centeredProvider]}
          hiddenByUser={userHidden.has(centeredProvider)}
          hiddenByCenter={presentationHidden.has(centeredProvider)}
          accessOpen={accessProvider === centeredProvider}
          setCenterStageRef={setCenterStageRef}
          openProvider={openProvider}
          togglePaneVisibility={togglePaneVisibility}
          changeProviderPresentation={changeProviderPresentation}
          toggleAdapterAccess={toggleAdapterAccess}
          syncBounds={syncBounds}
          reportProvider={reportProvider}
          reportBusy={reportBusy}
        />
      ) : (
        <section
          ref={setCenterStageRef}
          aria-label={t('provider.center')}
          className="min-h-[360px] flex-1 border border-zinc-800 bg-zinc-900"
        />
      )}

      <section className="mt-3 max-h-60 shrink-0 overflow-auto border border-zinc-800 bg-zinc-950 p-2">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
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
  hiddenByUser,
  hiddenByCenter,
  accessOpen,
  setCenterStageRef,
  openProvider,
  togglePaneVisibility,
  changeProviderPresentation,
  toggleAdapterAccess,
  syncBounds,
  reportProvider,
  reportBusy,
}: {
  provider: AIProvider;
  state: ProviderState;
  hiddenByUser: boolean;
  hiddenByCenter: boolean;
  accessOpen: boolean;
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  openProvider: (provider: AIProvider) => Promise<void>;
  togglePaneVisibility: (provider: AIProvider) => Promise<void>;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  toggleAdapterAccess: (provider: AIProvider) => void;
  syncBounds: (provider: AIProvider) => Promise<void>;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
}) {
  const { locale, t } = useI18n();
  const permissionSummary = buildAdapterPermissionSummary(provider, undefined, locale);
  const hidden = hiddenByUser || hiddenByCenter;

  return (
    <section ref={setCenterStageRef} className="flex min-h-[360px] flex-1 flex-col overflow-hidden border border-sky-900 bg-zinc-900">
      <div className="flex items-center justify-between gap-2 border-b border-sky-900 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">{AI_PROVIDERS[provider].name}</span>
        <div className="flex flex-wrap justify-end gap-2 text-xs">
          <button
            className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
            aria-label={formatI18n(t('provider.access.aria'), { provider: AI_PROVIDERS[provider].name })}
            aria-expanded={accessOpen}
            aria-controls={`adapter-access-${provider}`}
            onClick={() => toggleAdapterAccess(provider)}
          >
            {t('provider.access')}
          </button>
          <button
            className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void togglePaneVisibility(provider);
            }}
            disabled={state.webview !== 'loaded' || hiddenByCenter}
          >
            {hiddenByCenter ? t('provider.hidden') : hiddenByUser ? t('provider.show') : t('provider.hide')}
          </button>
          <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void changeProviderPresentation(provider, 'chip')}>
            {t('provider.chip')}
          </button>
          <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void changeProviderPresentation(provider, 'side')}>
            {t('provider.side')}
          </button>
          <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void host.provider.openLogin(provider)}>
            {t('provider.login')}
          </button>
          {provider === 'gemini' ? (
            <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void host.provider.openLoginExternal(provider)}>
              {t('provider.browser')}
            </button>
          ) : null}
          <button
            className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              resetProviderBootState(provider);
              void host.provider.reload(provider).then(() => syncBounds(provider));
            }}
            disabled={state.webview !== 'loaded'}
          >
            {t('provider.reload')}
          </button>
          <button
            className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void reportProvider(provider)}
            disabled={reportBusy}
          >
            {t('provider.report')}
          </button>
        </div>
      </div>
      {accessOpen ? <AdapterAccessPanel id={`adapter-access-${provider}`} summary={permissionSummary} /> : null}
      {state.adapter === 'broken' ? (
        <div className="border-b border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">{t('provider.adapterBroken')}</div>
      ) : null}
      {state.bridge === 'degraded' ? (
        <div className="border-b border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">
          {t('provider.bridgeDegradedReload')}
        </div>
      ) : null}
      {provider === 'gemini' && state.login === 'blocked' ? (
        <div className="flex items-center justify-between gap-2 border-b border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">
          <span>{t('provider.embeddedLoginBlocked')}</span>
          <button className="border border-amber-700 px-2 py-1 hover:bg-amber-900" onClick={() => void host.provider.openLoginExternal(provider)}>
            {t('provider.openInBrowser')}
          </button>
        </div>
      ) : null}
      {state.webview === 'loaded' ? (
        <div className="grid flex-1 place-items-center p-3 text-xs text-zinc-500">
          {hidden ? t('provider.nativeWebviewHidden') : t('provider.nativeWebviewCentered')}
        </div>
      ) : (
        <div className="grid flex-1 place-items-center">
          <button className="border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800" onClick={() => void openProvider(provider)}>
            {t('provider.open')} {AI_PROVIDERS[provider].name}
          </button>
        </div>
      )}
    </section>
  );
}

function ThumbnailTile({
  provider,
  state,
  presentation,
  hiddenByUser,
  hiddenByCenter,
  setPaneRef,
  changeProviderPresentation,
}: {
  provider: AIProvider;
  state: ProviderState;
  presentation: WebviewPresentationState;
  hiddenByUser: boolean;
  hiddenByCenter: boolean;
  setPaneRef: (provider: AIProvider, el: HTMLDivElement | null) => void;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
}) {
  const { t } = useI18n();
  const status = chipState(state, presentation, t);
  const hidden = hiddenByUser || hiddenByCenter;
  const focusProvider = () => {
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
      className={`min-h-24 cursor-pointer border bg-zinc-900 p-2 outline-none transition-colors hover:border-sky-700 focus:border-sky-600 ${
        hidden ? 'border-zinc-700' : 'border-zinc-800'
      }`}
      onClick={focusProvider}
      onKeyDown={onKeyDown}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-zinc-100">{AI_PROVIDERS[provider].name}</span>
        <span className={`shrink-0 border px-1.5 py-0.5 text-[11px] ${status.className}`}>{status.label}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          className="border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
          onClick={(event) => {
            event.stopPropagation();
            focusProvider();
          }}
        >
          {t('provider.center')}
        </button>
        {presentation !== 'chip' ? (
          <button
            className="border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
            onClick={(event) => {
              event.stopPropagation();
              void changeProviderPresentation(provider, 'chip');
            }}
          >
            {t('provider.chip')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AdapterAccessPanel({ id, summary }: { id: string; summary: AdapterPermissionSummary }) {
  const { t } = useI18n();

  return (
    <section id={id} className="border-b border-sky-900 bg-sky-950/30 px-3 py-3 text-xs text-zinc-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">{t('provider.access.heading')}</h3>
        <span className="shrink-0 text-[11px] text-sky-200">{summary.providerName}</span>
      </div>
      <div className="grid gap-3">
        <PermissionGroup title={t('provider.access.readTitle')} lines={summary.reads} />
        <PermissionGroup title={t('provider.access.writeTitle')} lines={summary.writes} />
        <PermissionGroup title={t('provider.access.cannotTitle')} lines={summary.cannot} />
      </div>
      {summary.note ? <p className="mt-3 border-t border-sky-900 pt-2 text-[11px] leading-relaxed text-zinc-500">{summary.note}</p> : null}
    </section>
  );
}

function PermissionGroup({ title, lines }: { title: string; lines: AdapterPermissionSummary['reads'] }) {
  return (
    <section>
      <div className="mb-1 font-semibold uppercase text-zinc-100">{title}</div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.title}>
            <span className="font-medium text-zinc-200">{line.title}:</span> <span className="leading-relaxed text-zinc-400">{line.detail}</span>
            {line.selectors ? (
              <ul className="mt-1 space-y-1 border-l border-zinc-700 pl-2">
                {line.selectors.map((selector) => (
                  <li key={selector}>
                    <code className="break-all text-[11px] text-sky-200">{selector}</code>
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
