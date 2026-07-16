import { useEffect, useRef, useState } from 'react';
import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import { resetProviderBootState } from '../bridge/pull';
import { host } from '../host';
import { useI18n } from '../i18n/context';
import { formatI18n } from '../i18n/t';
import type { AdapterPermissionSummary } from './adapterPermissions';
import { AiSisterAvatar } from './AiSisterTheme';
import { MarkdownText } from './MarkdownText';
import type { PresentationByProvider, WebviewPresentationState } from './presentation';
import { chipState } from './providerChipState';
import { ProcessTrace } from './ProcessTrace';
import type { ProcessTraceState } from './processTraceModel';

export type CenterSurface = 'text' | 'native';
const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

type ProviderActionState =
  | { provider: AIProvider; status: 'opening' }
  | { provider: AIProvider; status: 'error' };

export function FocusPane({
  centeredProvider,
  states,
  presentation,
  centerSurface,
  centerText,
  centerTextFinal,
  userHidden,
  presentationHidden,
  setPaneRef,
  setCenterStageRef,
  changeProviderPresentation,
  onManualFocusControl,
  onEnlargeCenter,
  onCollapseCenter,
  onOpenLogin,
  syncBounds,
  onFocusScroll,
  reportProvider,
  reportBusy,
  processTrace,
  onTraceDetailOpenChange,
  onChipClick,
}: {
  centeredProvider?: AIProvider;
  states: Record<AIProvider, ProviderState>;
  presentation: PresentationByProvider;
  centerSurface: CenterSurface;
  centerText?: string;
  centerTextFinal: boolean;
  userHidden: ReadonlySet<AIProvider>;
  presentationHidden: ReadonlySet<AIProvider>;
  setPaneRef: (provider: AIProvider, el: HTMLElement | null) => void;
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  onManualFocusControl: (provider: AIProvider) => void;
  onEnlargeCenter: () => void;
  onCollapseCenter: () => void;
  onOpenLogin: (provider: AIProvider) => Promise<void>;
  syncBounds: (provider: AIProvider) => Promise<void>;
  onFocusScroll?: () => void;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
  processTrace?: ProcessTraceState;
  onTraceDetailOpenChange?: (open: boolean) => void;
  onChipClick?: (provider: AIProvider) => void;
}) {
  const { locale, t } = useI18n();
  const [providerAction, setProviderAction] = useState<ProviderActionState | undefined>();
  const providerActionGeneration = useRef(0);

  const activateProvider = async (provider: AIProvider) => {
    const generation = (providerActionGeneration.current += 1);
    setProviderAction({ provider, status: 'opening' });
    try {
      await changeProviderPresentation(provider, 'center');
      if (generation === providerActionGeneration.current) setProviderAction(undefined);
    } catch {
      if (generation === providerActionGeneration.current) setProviderAction({ provider, status: 'error' });
    }
  };

  const openingProvider = providerAction?.status === 'opening' ? providerAction.provider : undefined;

  return (
    // overflow-y-auto 是極端小視窗下的逃生口，讓連線列在被擠壓時仍可捲到；
    // 捲動時原生 webview 的錨點只是換位置、尺寸不變，ResizeObserver 不會觸發，
    // 故用 onScroll（見 onFocusScroll）即時重新同步 webview 座標。
    <aside className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white dark:bg-zinc-950 p-3" onScroll={onFocusScroll}>
      {centeredProvider ? (
        <FocusStage
          provider={centeredProvider}
          state={states[centeredProvider]}
          centerSurface={centerSurface}
          centerText={centerText}
          centerTextFinal={centerTextFinal}
          hiddenByUser={userHidden.has(centeredProvider)}
          hiddenByCenter={presentationHidden.has(centeredProvider)}
          setCenterStageRef={setCenterStageRef}
          activateProvider={activateProvider}
          opening={openingProvider === centeredProvider || states[centeredProvider].webview === 'creating'}
          onManualFocusControl={onManualFocusControl}
          onEnlargeCenter={onEnlargeCenter}
          onCollapseCenter={onCollapseCenter}
          onOpenLogin={onOpenLogin}
          syncBounds={syncBounds}
          reportProvider={reportProvider}
          reportBusy={reportBusy}
        />
      ) : (
        <FirstRunPanel
          setCenterStageRef={setCenterStageRef}
          activateProvider={activateProvider}
          openingProvider={openingProvider}
        />
      )}

      {providerAction?.status === 'error' ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert">
          <span>{formatI18n(t('provider.openFailed'), { provider: AI_PROVIDERS[providerAction.provider].name })}</span>
          <button
            type="button"
            className="shrink-0 rounded border border-red-400 px-2 py-1 font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
            onClick={() => void activateProvider(providerAction.provider)}
          >
            {t('provider.retry')}
          </button>
        </div>
      ) : null}

      {processTrace ? <ProcessTrace trace={processTrace} locale={locale} onDetailOpenChange={onTraceDetailOpenChange} /> : null}

      <StatusStrip
        centeredProvider={centeredProvider}
        states={states}
        presentation={presentation}
        setPaneRef={setPaneRef}
        activateProvider={activateProvider}
        openingProvider={openingProvider}
        onChipClick={onChipClick}
      />
    </aside>
  );
}

function FirstRunPanel({
  setCenterStageRef,
  activateProvider,
  openingProvider,
}: {
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  activateProvider: (provider: AIProvider) => Promise<void>;
  openingProvider?: AIProvider;
}) {
  const { t } = useI18n();
  return (
    // 固定 px 高度而非 rem：app 的字體大小設定可無上限放大 document root font-size，
    // rem-based min-h 會跟著放大並吃掉下方連線列可用的空間，px 才是真正的 bounded floor。
    <section
      ref={setCenterStageRef}
      aria-labelledby="first-run-title"
      className="ai-sister-first-run grid min-h-[160px] flex-1 place-items-center overflow-auto rounded-lg border border-zinc-200 bg-gradient-to-b from-sky-50 to-white p-4 dark:border-zinc-800 dark:from-sky-950/30 dark:to-zinc-950"
    >
      <div className="w-full max-w-2xl text-center">
        <div className="ai-sister-onboarding-star mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky-100 text-2xl dark:bg-sky-950" aria-hidden="true">
          ✦
        </div>
        <h1 id="first-run-title" className="mt-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          {t('onboarding.title')}
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{t('onboarding.description')}</p>
        <div className="ai-sister-onboarding-providers mt-5 grid grid-cols-2 gap-2 min-[900px]:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const opening = openingProvider === provider;
            return (
              <button
                key={provider}
                type="button"
                className="rounded-md border border-zinc-300 bg-white px-4 py-3 text-left text-sm font-medium shadow-sm transition hover:border-sky-500 hover:bg-sky-50 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-sky-600 dark:hover:bg-sky-950/50"
                disabled={openingProvider !== undefined}
                onClick={() => void activateProvider(provider)}
              >
                <span className="flex items-center gap-2">
                  <AiSisterAvatar provider={provider} size="md" active={opening} />
                  <span className="default-provider-action-label min-w-0 truncate">{opening ? t('provider.opening') : `${t('provider.open')} ${AI_PROVIDERS[provider].name}`}</span>
                  <span className="ai-sister-only ai-sister-provider-action-label min-w-0">{opening ? t('provider.opening') : AI_PROVIDERS[provider].name}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="ai-sister-onboarding-hint mt-4 text-xs text-zinc-500 dark:text-zinc-400">{t('onboarding.hint')}</p>
      </div>
    </section>
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
  setCenterStageRef,
  activateProvider,
  opening,
  onManualFocusControl,
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
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  activateProvider: (provider: AIProvider) => Promise<void>;
  opening: boolean;
  onManualFocusControl: (provider: AIProvider) => void;
  onEnlargeCenter: () => void;
  onCollapseCenter: () => void;
  onOpenLogin: (provider: AIProvider) => Promise<void>;
  syncBounds: (provider: AIProvider) => Promise<void>;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
}) {
  const { t } = useI18n();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const hidden = hiddenByUser || hiddenByCenter;
  const showLoginCta = state.login === 'logged_out' || state.login === 'blocked';
  const moreMenuId = `provider-actions-${provider}`;

  useEffect(() => {
    if (!moreMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreMenuOpen(false);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && moreMenuRef.current?.contains(target)) return;
      setMoreMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  }, [moreMenuOpen]);

  return (
    <section
      className="ai-sister-focus-stage flex min-h-[160px] flex-1 flex-col overflow-hidden border border-sky-300 dark:border-sky-900 bg-zinc-50 dark:bg-zinc-900"
      onPointerDownCapture={() => onManualFocusControl(provider)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-sky-300 dark:border-sky-900 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2 truncate">
          <AiSisterAvatar provider={provider} size="sm" active={state.thinking} />
          <span className="truncate">{AI_PROVIDERS[provider].name}</span>
        </span>
        <div className="flex flex-wrap justify-end gap-2 text-xs">
          {centerSurface === 'text' ? (
            <button type="button" className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onEnlargeCenter}>
              {t('provider.realPage')}
            </button>
          ) : (
            <button type="button" className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onCollapseCenter}>
              {t('provider.textView')}
            </button>
          )}
          {showLoginCta ? (
            <button
              type="button"
              className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-2 py-1 text-amber-800 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900"
              onClick={() => void onOpenLogin(provider)}
            >
              {t('provider.login')}
            </button>
          ) : null}
          <div ref={moreMenuRef} className="relative">
            <button
              type="button"
              className="min-w-8 border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label={t('provider.moreActions')}
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
              aria-controls={moreMenuId}
              onClick={() => setMoreMenuOpen((current) => !current)}
            >
              <span aria-hidden="true">&#8943;</span>
            </button>
            {moreMenuOpen ? (
              <div
                id={moreMenuId}
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-32 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-2 py-1.5 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    resetProviderBootState(provider);
                    void host.provider.reload(provider).then(() => syncBounds(provider));
                  }}
                  disabled={state.webview !== 'loaded'}
                >
                  {t('provider.reload')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-2 py-1.5 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    void reportProvider(provider);
                  }}
                  disabled={reportBusy}
                >
                  {t('provider.report')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {/* WebView 以此區域定位，讓上方標題列（含「文字檢視」返回鈕）保持可見 */}
      <div ref={setCenterStageRef} className="flex min-h-0 flex-1 flex-col">
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
          <button type="button" className="border border-amber-300 dark:border-amber-700 px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900" onClick={() => void host.provider.openLoginExternal(provider)}>
            {t('provider.openInBrowser')}
          </button>
        </div>
      ) : null}
      {state.webview !== 'loaded' ? (
        <div className="grid flex-1 place-items-center p-6 text-center" role="status" aria-live="polite">
          {opening || state.webview === 'creating' ? (
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              <span className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-sky-600 motion-reduce:animate-none dark:border-zinc-700 dark:border-t-sky-400" aria-hidden="true" />
              {t('provider.opening')} {AI_PROVIDERS[provider].name}
            </div>
          ) : (
            <button type="button" className="rounded border border-sky-500 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100 dark:hover:bg-sky-900" onClick={() => void activateProvider(provider)}>
              {t('provider.open')} {AI_PROVIDERS[provider].name}
            </button>
          )}
        </div>
      ) : centerSurface === 'text' ? (
        <TextCenterView
          provider={provider}
          thinking={state.thinking}
          centerText={centerText}
          centerTextFinal={centerTextFinal}
          idleText={showLoginCta ? t('provider.signInPrompt') : state.dom === 'ready' ? t('provider.centerReady') : t('provider.checking')}
        />
      ) : state.webview === 'loaded' ? (
        <div className="grid flex-1 place-items-center p-3 text-xs text-zinc-500 dark:text-zinc-500">
          {hidden ? t('provider.nativeWebviewHidden') : t('provider.nativeWebviewCentered')}
        </div>
      ) : null}
      </div>
    </section>
  );
}

export function TextCenterView({
  provider,
  thinking,
  centerText,
  centerTextFinal,
  idleText,
}: {
  provider?: AIProvider;
  thinking: boolean;
  centerText?: string;
  centerTextFinal: boolean;
  idleText?: string;
}) {
  const { t } = useI18n();
  if (thinking && !centerTextFinal) {
    return (
      <div className="grid flex-1 place-items-center p-3">
        <div className="ai-sister-thinking-state flex items-center gap-3">
          {provider ? <AiSisterAvatar provider={provider} size="lg" active /> : null}
          <div className="whitespace-pre-wrap text-sm italic text-zinc-500 dark:text-zinc-500">{t('chat.thinking')}</div>
        </div>
      </div>
    );
  }

  if (centerText) {
    return (
      <div className="flex-1 overflow-auto p-3 text-zinc-900 dark:text-zinc-100">
        <div className="text-sm">
          <MarkdownText text={centerText} />
        </div>
      </div>
    );
  }

  return <div className="grid flex-1 place-items-center p-3 text-center text-sm text-zinc-500 dark:text-zinc-400" role="status">{idleText ?? t('provider.centerIdle')}</div>;
}

function StatusStrip({
  centeredProvider,
  states,
  presentation,
  setPaneRef,
  activateProvider,
  openingProvider,
  onChipClick,
}: {
  centeredProvider?: AIProvider;
  states: Record<AIProvider, ProviderState>;
  presentation: PresentationByProvider;
  setPaneRef: (provider: AIProvider, el: HTMLElement | null) => void;
  activateProvider: (provider: AIProvider) => Promise<void>;
  openingProvider?: AIProvider;
  onChipClick?: (provider: AIProvider) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="provider-connections-title" className="ai-sister-connections mt-3 shrink-0 overflow-x-auto overflow-y-hidden rounded border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <h2 id="provider-connections-title" className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{t('provider.connections')}</h2>
        <span className="text-[0.6875rem] text-zinc-500 dark:text-zinc-400">{t('provider.connectionsHint')}</span>
      </div>
      <div className="ai-sister-connection-grid grid grid-cols-4 gap-1.5">
        {PROVIDERS.map((provider) => (
          <StatusStripItem
            key={provider}
            provider={provider}
            state={states[provider]}
            presentation={presentation[provider]}
            centered={provider === centeredProvider}
            setPaneRef={setPaneRef}
            activateProvider={activateProvider}
            openingProvider={openingProvider}
            onChipClick={onChipClick}
          />
        ))}
      </div>
    </section>
  );
}

function StatusStripItem({
  provider,
  state,
  presentation,
  centered,
  setPaneRef,
  activateProvider,
  openingProvider,
  onChipClick,
}: {
  provider: AIProvider;
  state: ProviderState;
  presentation: WebviewPresentationState;
  centered: boolean;
  setPaneRef: (provider: AIProvider, el: HTMLElement | null) => void;
  activateProvider: (provider: AIProvider) => Promise<void>;
  openingProvider?: AIProvider;
  onChipClick?: (provider: AIProvider) => void;
}) {
  const { t } = useI18n();
  const status = chipState(state, presentation, t);
  const focusProvider = () => {
    onChipClick?.(provider);
    if (centered && state.webview === 'loaded') return;
    void activateProvider(provider);
  };

  return (
    <button
      type="button"
      ref={(el) => setPaneRef(provider, el)}
      aria-label={`${AI_PROVIDERS[provider].name}: ${status.label}`}
      aria-pressed={centered}
      disabled={state.webview === 'creating' || openingProvider !== undefined}
      className={`ai-sister-provider-card min-w-0 rounded border px-2 py-1.5 text-left transition-colors disabled:cursor-wait disabled:opacity-70 ${
        centered
          ? 'cursor-default border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/40'
          : 'cursor-pointer border-zinc-200 bg-zinc-50 hover:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-700'
      }`}
      onClick={focusProvider}
    >
      <span className="flex min-w-0 items-center gap-2">
        <AiSisterAvatar provider={provider} size="md" active={state.thinking} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">{AI_PROVIDERS[provider].name}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1">
            <span className={`h-2 w-2 shrink-0 rounded-full ${status.dotClassName}`} aria-hidden="true" />
            <span className={`min-w-0 truncate text-[0.6875rem] ${status.className}`}>{openingProvider === provider ? t('connection.connecting') : status.label}</span>
          </span>
        </span>
      </span>
    </button>
  );
}

export function AdapterAccessPanel({ id, summary }: { id: string; summary: AdapterPermissionSummary }) {
  const { t } = useI18n();

  return (
    <section id={id} className="border-b border-sky-300 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-3 py-3 text-xs text-zinc-700 dark:text-zinc-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('provider.access.heading')}</h3>
        <span className="shrink-0 text-[0.6875rem] text-sky-700 dark:text-sky-200">{summary.providerName}</span>
      </div>
      <div className="grid gap-3">
        <PermissionGroup title={t('provider.access.readTitle')} lines={summary.reads} />
        <PermissionGroup title={t('provider.access.writeTitle')} lines={summary.writes} />
        <PermissionGroup title={t('provider.access.cannotTitle')} lines={summary.cannot} />
      </div>
      {summary.note ? <p className="mt-3 border-t border-sky-300 dark:border-sky-900 pt-2 text-[0.6875rem] leading-relaxed text-zinc-500 dark:text-zinc-500">{summary.note}</p> : null}
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
                    <code className="break-all text-[0.6875rem] text-sky-700 dark:text-sky-200">{selector}</code>
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
