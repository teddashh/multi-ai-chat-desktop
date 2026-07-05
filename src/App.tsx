import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS } from '../shared/constants';
import type { AIProvider, BridgeMessage, ChatMode, ModeRoles, ProviderState } from '../shared/types';
import { startBridgePull, resetProviderBootState } from './bridge/pull';
import { isRenderableResponseMessage } from './bridge/render';
import { publishBridgeMessage } from './bridge/bus';
import { EchoPanel } from './dev/EchoPanel';
import { host } from './host';
import { mergePullBridgeState, type PullBridgeState } from './appBridgeState';
import { isSendable, onStepTimeoutEvent, runWorkflow } from './workflow';
import type { PreflightResult } from './workflow/preflight';
import { bubbleAuthorLabel } from './bubbleAuthorLabel';
import { InputBar } from './ui/InputBar';
import { ModeSelector } from './ui/ModeSelector';
import { PreflightDialog } from './ui/PreflightDialog';
import { RoleConfig } from './ui/RoleConfig';
import { StepTimeoutDialog, type StepTimeoutDialogState } from './ui/StepTimeoutDialog';
import { TargetChips } from './ui/TargetChips';
import { buildAdapterPermissionSummary, type AdapterPermissionSummary } from './ui/adapterPermissions';
import {
  DEFAULT_DOCK_CONSTRAINTS,
  DEFAULT_COLUMN_WIDTHS,
  clampColumnWidths,
  dragColumnWidth,
  gridTemplateColumns,
  maxProviderWidth,
  type ColumnWidths,
} from './ui/dockLayout';
import { defaultRolesForMode, isSerialMode } from './ui/modeRoles';
import { buildPreflightDialogModel } from './ui/preflightModel';
import { preflightFromResult } from './ui/preflightFromResult';
import { processingAfterSend, processingAfterSettle, processingAfterWorkflowStatus } from './ui/processing';
import { Resizer } from './ui/Resizer';
import { SettingsModal } from './ui/SettingsModal';
import { defaultSettings, mergeSettings, normalizeSettings, slotProviders, type AppSettings } from './ui/settingsModel';
import { DEFAULT_SLOT_ASSIGNMENT, type SlotAssignment } from './ui/slotAssignment';
import { nextStepTimeoutState } from './ui/stepTimeoutState';
import { defaultTargets, freeModeTargets } from './ui/targets';
import { useOverlayGuard } from './ui/useOverlayGuard';
import { visibleLoadedProviders } from './ui/visibility';
import { buildMarkdown, exportFilename } from './ui/exportMarkdown';
import { formatReportBody, type AdapterNotice, type ReportDigest } from './ui/reportBroken';

interface Bubble {
  id: string;
  provider?: AIProvider | 'system' | (string & {});
  role: 'user' | 'ai';
  content: string;
  final?: boolean;
  truncated?: boolean;
  modeRole?: string;
}

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

function renderablePayload(payload: unknown): { content: string; truncated: boolean } {
  if (typeof payload === 'string') return { content: payload, truncated: false };
  if (payload && typeof payload === 'object' && 'text' in payload) {
    const typed = payload as { text?: unknown; truncated?: unknown };
    return {
      content: typeof typed.text === 'string' ? typed.text : '',
      truncated: typed.truncated === true,
    };
  }
  return { content: JSON.stringify(payload ?? ''), truncated: false };
}

export default function App() {
  const [states, setStates] = useState<Record<AIProvider, ProviderState>>(() =>
    Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider,
        { provider, webview: 'none', dom: 'unknown', login: 'unknown', thinking: false, lastStatusAt: 0 },
      ]),
    ) as Record<AIProvider, ProviderState>,
  );
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState('');
  const [mode, setMode] = useState<ChatMode>('free');
  const [roles, setRoles] = useState<ModeRoles>(() => defaultRolesForMode('debate'));
  const [targets, setTargets] = useState<AIProvider[]>([]);
  const [targetsInitialized, setTargetsInitialized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preflight, setPreflight] = useState<{ mode: Exclude<ChatMode, 'free'>; result: PreflightResult } | undefined>();
  const [stepTimeout, setStepTimeout] = useState<StepTimeoutDialogState | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>();
  const [reportPreview, setReportPreview] = useState<{ provider: AIProvider; digest: ReportDigest; body: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [adapterNotice, setAdapterNotice] = useState<AdapterNotice | null>(null);
  const [sharing, setSharing] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => defaultSettings());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [initialRestoreComplete, setInitialRestoreComplete] = useState(false);
  const [connectionSnapshotLoaded, setConnectionSnapshotLoaded] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [slotAssignment, setSlotAssignment] = useState<SlotAssignment>(() => ({ ...DEFAULT_SLOT_ASSIGNMENT }));
  const [userHidden, setUserHidden] = useState<Set<AIProvider>>(() => new Set());
  const [accessProvider, setAccessProvider] = useState<AIProvider | null>(null);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);
  const statesRef = useRef(states);
  const settingsRef = useRef<AppSettings>(appSettings);
  const pendingRestore = useRef<Set<AIProvider>>(new Set());
  const dragStartWidths = useRef<ColumnWidths>({ ...DEFAULT_COLUMN_WIDTHS });
  const turnRef = useRef(0);
  const activeTurns = useRef(new Map<AIProvider, { turn: number; label?: string }>());
  const pullBridge = useRef(new Map<AIProvider, PullBridgeState>());
  const loadedModalProviders = useMemo(() => visibleLoadedProviders(states, userHidden, PROVIDERS), [states, userHidden]);
  const sendableTargets = useMemo(() => defaultTargets(states, PROVIDERS), [states]);
  const noSendableProviders = sendableTargets.length === 0;
  const openProviders = useMemo(() => PROVIDERS.filter((provider) => states[provider].webview === 'loaded'), [states]);
  const leftProviders = useMemo(() => slotProviders(slotAssignment, 'left'), [slotAssignment]);
  const rightProviders = useMemo(() => slotProviders(slotAssignment, 'right'), [slotAssignment]);

  const overlayGuardOpen =
    Boolean(preflight) || Boolean(stepTimeout?.timedOut) || settingsOpen || Boolean(reportPreview) || Boolean(accessProvider);
  useOverlayGuard(overlayGuardOpen, loadedModalProviders);

  useEffect(() => {
    statesRef.current = states;
  }, [states]);

  useEffect(() => {
    settingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    if (!shareNotice) return;
    const t = window.setTimeout(() => setShareNotice(undefined), 5000);
    return () => window.clearTimeout(t);
  }, [shareNotice]);

  useEffect(() => {
    if (!adapterNotice) return;
    const t = window.setTimeout(() => setAdapterNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [adapterNotice]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void host.adapter.onNotice((notice) => setAdapterNotice(notice)).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  const persistSettingsPatch = useCallback(async (patch: Partial<AppSettings>) => {
    const next = mergeSettings(settingsRef.current, patch);
    settingsRef.current = next;
    setAppSettings(next);
    await host.settings.set(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    void host.settings
      .get()
      .then((value) => {
        if (disposed) return;
        const loaded = normalizeSettings(value);
        settingsRef.current = loaded;
        setAppSettings(loaded);
        setColumnWidths(loaded.columnWidths);
        setSlotAssignment(loaded.slotAssignment);
        pendingRestore.current = new Set(loaded.openProviders);
        setInitialRestoreComplete(loaded.openProviders.length === 0);
      })
      .catch(() => {
        if (disposed) return;
        const defaults = defaultSettings();
        settingsRef.current = defaults;
        setAppSettings(defaults);
        setInitialRestoreComplete(true);
      })
      .finally(() => {
        if (!disposed) setSettingsLoaded(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const handleBridgeMessage = (message: BridgeMessage) => {
      if (message.action === 'STATUS_REPORT' && message.provider) {
        const payload = message.payload as { bridge?: 'ok' | 'degraded'; reason?: string } | undefined;
        if (payload?.bridge) {
          if (message.transport === 'local') {
            if (payload.bridge === 'degraded') pullBridge.current.set(message.provider, { bridge: 'degraded', reason: payload.reason });
            else pullBridge.current.delete(message.provider);
          }
          setStates((current) => ({
            ...current,
            [message.provider as AIProvider]: {
              ...current[message.provider as AIProvider],
              bridge: payload.bridge,
              bridgeReason: payload.reason,
            },
          }));
        }
        return;
      }
      if (message.action === 'WORKFLOW_STATUS') {
        const status = typeof message.payload === 'string' ? message.payload : '';
        setWorkflowStatus(status);
        if (status === '') setStepTimeout((current) => nextStepTimeoutState(current, { type: 'settle' }));
        setIsProcessing((current) => processingAfterWorkflowStatus(current, status));
        return;
      }
      if (message.action === 'ROLE_ASSIGNMENT' && message.provider) {
        const payload = message.payload as { turn?: unknown; label?: unknown } | undefined;
        if (typeof payload?.turn === 'number') {
          activeTurns.current.set(message.provider, {
            turn: payload.turn,
            label: typeof payload.label === 'string' ? payload.label : undefined,
          });
        }
        return;
      }
      if (!isRenderableResponseMessage(message) || !message.provider) return;
      let active = activeTurns.current.get(message.provider);
      if (!active) {
        active = { turn: ++turnRef.current };
        activeTurns.current.set(message.provider, active);
      }
      const { content, truncated } = renderablePayload(message.payload);
      setMessages((current) => {
        const id = `ai-${message.provider}-${active.turn}`;
        const existing = current.find((bubble) => bubble.id === id);
        if (existing) {
          return current.map((bubble) =>
            bubble.id === id
              ? { ...bubble, content, truncated, final: message.action === 'RESPONSE_DONE' ? true : bubble.final }
              : bubble,
          );
        }
        return [
          ...current,
          {
            id,
            role: 'ai',
            provider: message.provider,
            modeRole: active.label,
            content,
            truncated,
            final: message.action === 'RESPONSE_DONE',
          },
        ];
      });
      if (message.action === 'RESPONSE_DONE') {
        activeTurns.current.delete(message.provider);
      }
    };

    let disposed = false;
    let cleanupPull: (() => void) | undefined;
    let cleanupUpdates: (() => void) | undefined;
    let cleanupBridge: (() => void) | undefined;

    void startBridgePull().then((cleanup) => {
      if (disposed) cleanup();
      else cleanupPull = cleanup;
    });
    void host.connections.get().then((snapshot) => {
      if (disposed) return;
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(snapshot.map((state) => [state.provider, mergePullBridgeState(state, pullBridge.current.get(state.provider))])),
      }));
      setConnectionSnapshotLoaded(true);
    });
    void host.connections.onUpdate((state) => {
      setStates((current) => ({ ...current, [state.provider]: mergePullBridgeState(state, pullBridge.current.get(state.provider)) }));
    }).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupUpdates = cleanup;
    });
    void host.bridge.onMessage(handleBridgeMessage).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupBridge = cleanup;
    });
    const cleanupTimeout = onStepTimeoutEvent((event) => {
      setStepTimeout((current) => nextStepTimeoutState(current, event));
    });

    return () => {
      disposed = true;
      cleanupPull?.();
      cleanupUpdates?.();
      cleanupBridge?.();
      cleanupTimeout();
    };
  }, []);

  useEffect(() => {
    if (mode === 'free') return;
    setRoles(defaultRolesForMode(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'free' || targetsInitialized) return;
    const nextTargets = defaultTargets(states, PROVIDERS);
    if (nextTargets.length === 0) return;
    setTargets(nextTargets);
    setTargetsInitialized(true);
  }, [mode, states, targetsInitialized]);

  const openProvider = useCallback(async (provider: AIProvider) => {
    const rect = paneRefs.current[provider]?.getBoundingClientRect() ?? new DOMRect(24, 24, 420, 320);
    resetProviderBootState(provider);
    await host.provider.open(provider, rect);
  }, []);

  const syncBounds = useCallback(async (provider: AIProvider) => {
    const rect = paneRefs.current[provider]?.getBoundingClientRect();
    if (!rect || statesRef.current[provider].webview !== 'loaded') return;
    await host.layout.setBounds(provider, rect);
  }, []);

  const syncAllBounds = useCallback(() => {
    for (const provider of PROVIDERS) void syncBounds(provider);
  }, [syncBounds]);

  const setPaneRef = useCallback(
    (provider: AIProvider, el: HTMLDivElement | null) => {
      paneRefs.current[provider] = el;
      if (!el) return;
      void syncBounds(provider);
      if (pendingRestore.current.has(provider)) {
        pendingRestore.current.delete(provider);
        void openProvider(provider).finally(() => {
          if (pendingRestore.current.size === 0) setInitialRestoreComplete(true);
        });
      }
    },
    [openProvider, syncBounds],
  );

  useEffect(() => {
    if (
      !settingsLoaded ||
      !connectionSnapshotLoaded ||
      !initialRestoreComplete ||
      openProviders.join('|') === settingsRef.current.openProviders.join('|')
    ) {
      return;
    }
    void persistSettingsPatch({ openProviders });
  }, [connectionSnapshotLoaded, initialRestoreComplete, openProviders, persistSettingsPatch, settingsLoaded]);

  useEffect(() => {
    const onResize = () => syncAllBounds();
    window.addEventListener('resize', onResize);

    const observers: ResizeObserver[] = [];
    if ('ResizeObserver' in window) {
      for (const provider of PROVIDERS) {
        const el = paneRefs.current[provider];
        if (!el) continue;
        const observer = new ResizeObserver(() => {
          void syncBounds(provider);
        });
        observer.observe(el);
        observers.push(observer);
      }
    }

    const timer = window.setInterval(onResize, 2500);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearInterval(timer);
      for (const observer of observers) observer.disconnect();
    };
  }, [leftProviders, rightProviders, syncAllBounds, syncBounds]);

  useEffect(() => {
    syncAllBounds();
  }, [columnWidths, syncAllBounds]);

  const send = async (trimmed: string) => {
    if (!trimmed) return;
    const turnId = ++turnRef.current;
    setMessages((current) => [...current, { id: `user-${turnId}`, role: 'user', content: trimmed, final: true }]);
    setIsProcessing(processingAfterSend());
    const result = await runWorkflow({
      text: trimmed,
      mode,
      roles: mode === 'free' ? undefined : roles,
      targets: mode === 'free' ? freeModeTargets(targets, statesRef.current) : undefined,
    });
    const blockedPreflight = preflightFromResult(mode, result);
    if (blockedPreflight && isSerialMode(mode)) setPreflight(blockedPreflight);
    setStepTimeout(undefined);
    setIsProcessing(processingAfterSettle());
  };

  const cancelWorkflow = () => {
    publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });
    setIsProcessing(false);
    setWorkflowStatus('');
    setStepTimeout(undefined);
  };

  const exportConversation = async () => {
    if (messages.length === 0 || sharing) return;
    setSharing(true);
    try {
      const now = new Date();
      const { content } = buildMarkdown(messages, mode, now);
      const saved = await host.share.exportMarkdown(exportFilename(mode, now), content);
      if (saved) setShareNotice({ kind: 'ok', text: `Exported: ${saved}` });
    } catch (reason) {
      setShareNotice({ kind: 'error', text: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setSharing(false);
    }
  };

  const publishConversation = async () => {
    if (messages.length === 0 || sharing) return;
    setSharing(true);
    try {
      const now = new Date();
      const { title, content } = buildMarkdown(messages, mode, now);
      const dated = `${title} — ${now.toLocaleString()}`;
      const url = await host.publish.hackmd(dated, content);
      setShareNotice({ kind: 'ok', text: `Published: ${url}` });
    } catch (reason) {
      setShareNotice({ kind: 'error', text: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setSharing(false);
    }
  };

  const reportProvider = useCallback(
    async (provider: AIProvider) => {
      if (reportBusy) return;
      setReportBusy(true);
      try {
        const raw = await host.adapter.reportBroken(provider);
        const digest = JSON.parse(raw) as ReportDigest;
        setReportPreview({ provider, digest, body: formatReportBody(digest) });
      } catch (error) {
        setAdapterNotice({ provider, kind: 'report-failed', message: String(error) });
      } finally {
        setReportBusy(false);
      }
    },
    [reportBusy],
  );

  const openReportIssue = async () => {
    if (!reportPreview || reportBusy) return;
    setReportBusy(true);
    try {
      await host.adapter.openIssue(reportPreview.provider, reportPreview.body);
      setReportPreview(null);
    } catch (error) {
      setAdapterNotice({ provider: reportPreview.provider, kind: 'report-failed', message: String(error) });
    } finally {
      setReportBusy(false);
    }
  };

  const dragProviderColumn = (side: keyof ColumnWidths, deltaX: number, phase: 'start' | 'move' | 'end') => {
    if (phase === 'start') {
      dragStartWidths.current = columnWidths;
      return;
    }
    const containerWidth = gridRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const oppositeWidth = side === 'left' ? dragStartWidths.current.right : dragStartWidths.current.left;
    const maxWidth = maxProviderWidth(containerWidth, oppositeWidth, DEFAULT_DOCK_CONSTRAINTS);
    const directionalDelta = side === 'left' ? deltaX : -deltaX;
    const nextWidth = dragColumnWidth(
      dragStartWidths.current[side],
      directionalDelta,
      DEFAULT_DOCK_CONSTRAINTS.minProviderWidth,
      maxWidth,
    );
    const next = clampColumnWidths({ ...dragStartWidths.current, [side]: nextWidth }, containerWidth, DEFAULT_DOCK_CONSTRAINTS);
    setColumnWidths(next);
    if (phase === 'end') void persistSettingsPatch({ columnWidths: next });
  };

  const togglePaneVisibility = async (provider: AIProvider) => {
    if (userHidden.has(provider)) {
      await host.provider.show(provider);
      setUserHidden((current) => {
        const next = new Set(current);
        next.delete(provider);
        return next;
      });
      window.requestAnimationFrame(() => void syncBounds(provider));
      return;
    }

    await host.provider.hide(provider);
    setUserHidden((current) => new Set(current).add(provider));
  };

  const toggleAdapterAccess = useCallback((provider: AIProvider) => {
    setAccessProvider((current) => (current === provider ? null : provider));
  }, []);

  const applySavedSettings = (settings: AppSettings) => {
    settingsRef.current = settings;
    setAppSettings(settings);
    setColumnWidths(settings.columnWidths);
    setSlotAssignment(settings.slotAssignment);
  };

  return (
    <main className="h-screen bg-zinc-950 text-zinc-100">
      <div ref={gridRef} className="grid h-full" style={{ gridTemplateColumns: gridTemplateColumns(columnWidths) }}>
        <ProviderColumn
          providers={leftProviders}
          states={states}
          userHidden={userHidden}
          setPaneRef={setPaneRef}
          openProvider={openProvider}
          togglePaneVisibility={togglePaneVisibility}
          accessProvider={accessProvider}
          toggleAdapterAccess={toggleAdapterAccess}
          syncBounds={syncBounds}
          reportProvider={reportProvider}
          reportBusy={reportBusy}
        />

        <Resizer label="Resize left provider column" onDrag={(deltaX, phase) => dragProviderColumn('left', deltaX, phase)} />

        <section className="flex min-w-0 flex-col border-x border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-start gap-3 border-b border-zinc-800 pb-3">
            <div className="min-w-0 flex-1">
              <ConnectionBar states={states} mode={mode} targets={targets} onTargetsChange={setTargets} />
            </div>
            <button
              className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void exportConversation()}
              disabled={messages.length === 0 || sharing}
            >
              Export .md
            </button>
            <button
              className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void publishConversation()}
              disabled={messages.length === 0 || sharing}
            >
              Publish HackMD
            </button>
            <button className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          </div>
          <div className="mt-3">
            <ModeSelector mode={mode} onModeChange={setMode} />
            <RoleConfig mode={mode} roles={roles} onRolesChange={setRoles} />
          </div>
          {workflowStatus ? <div className="mt-3 border border-sky-900 bg-sky-950 px-3 py-2 text-xs text-sky-200">{workflowStatus}</div> : null}
          {shareNotice ? (
            <div
              className={
                shareNotice.kind === 'error'
                  ? 'mt-3 border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200'
                  : 'mt-3 border border-emerald-900 bg-emerald-950 px-3 py-2 text-xs text-emerald-200'
              }
            >
              {shareNotice.text}
            </div>
          ) : null}
          {adapterNotice ? (
            <div className={`mt-3 border px-3 py-2 text-xs ${adapterNoticeClass(adapterNotice.kind)}`}>
              {adapterNoticeText(adapterNotice)}
            </div>
          ) : null}
          {stepTimeout && !stepTimeout.timedOut ? <StepTimeoutDialog event={stepTimeout} onClose={() => setStepTimeout(undefined)} /> : null}
          <div className="mt-4 min-h-0 flex-1 overflow-auto border-y border-zinc-800 py-3">
            <ChatArea messages={messages} />
            {import.meta.env.DEV ? <EchoPanel /> : null}
          </div>
          <InputBar onSend={(value) => void send(value)} onCancel={cancelWorkflow} disabled={noSendableProviders} isProcessing={isProcessing} />
        </section>

        <Resizer label="Resize right provider column" onDrag={(deltaX, phase) => dragProviderColumn('right', deltaX, phase)} />

        <ProviderColumn
          providers={rightProviders}
          states={states}
          userHidden={userHidden}
          setPaneRef={setPaneRef}
          openProvider={openProvider}
          togglePaneVisibility={togglePaneVisibility}
          accessProvider={accessProvider}
          toggleAdapterAccess={toggleAdapterAccess}
          syncBounds={syncBounds}
          reportProvider={reportProvider}
          reportBusy={reportBusy}
        />
      </div>
      {preflight ? (
        <PreflightDialog
          model={buildPreflightDialogModel(preflight.mode, preflight.result, states)}
          onOpenLogin={(provider) => {
            void host.provider.openLogin(provider);
          }}
          onReassign={() => setPreflight(undefined)}
          onSwitchMode={() => {
            setMode('free');
            setPreflight(undefined);
          }}
        />
      ) : null}
      {stepTimeout?.timedOut ? <StepTimeoutDialog event={stepTimeout} onClose={() => setStepTimeout(undefined)} /> : null}
      <SettingsModal
        open={settingsOpen}
        columnWidths={columnWidths}
        slotAssignment={slotAssignment}
        openProviders={openProviders}
        onClose={() => setSettingsOpen(false)}
        onSaved={applySavedSettings}
      />
      {reportPreview ? (
        <ReportPreviewDialog
          preview={reportPreview}
          busy={reportBusy}
          onOpenIssue={() => void openReportIssue()}
          onCancel={() => setReportPreview(null)}
        />
      ) : null}
    </main>
  );
}

function ProviderColumn({
  providers,
  states,
  userHidden,
  setPaneRef,
  openProvider,
  togglePaneVisibility,
  accessProvider,
  toggleAdapterAccess,
  syncBounds,
  reportProvider,
  reportBusy,
}: {
  providers: AIProvider[];
  states: Record<AIProvider, ProviderState>;
  userHidden: ReadonlySet<AIProvider>;
  setPaneRef: (provider: AIProvider, el: HTMLDivElement | null) => void;
  openProvider: (provider: AIProvider) => Promise<void>;
  togglePaneVisibility: (provider: AIProvider) => Promise<void>;
  accessProvider: AIProvider | null;
  toggleAdapterAccess: (provider: AIProvider) => void;
  syncBounds: (provider: AIProvider) => Promise<void>;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
}) {
  return (
    <aside className="space-y-3 border-zinc-800 p-3">
      {providers.map((provider) => {
        const hidden = userHidden.has(provider);
        const accessOpen = accessProvider === provider;
        const permissionSummary = buildAdapterPermissionSummary(provider);
        return (
          <div
            key={provider}
            ref={(el) => setPaneRef(provider, el)}
            className="relative h-[calc(50vh-20px)] min-h-56 overflow-auto border border-zinc-800 bg-zinc-900"
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{AI_PROVIDERS[provider].name}</span>
              <div className="flex flex-wrap justify-end gap-2 text-xs">
                <button
                  className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  aria-label={`${AI_PROVIDERS[provider].name} adapter access`}
                  aria-expanded={accessOpen}
                  aria-controls={`adapter-access-${provider}`}
                  onClick={() => toggleAdapterAccess(provider)}
                >
                  Access
                </button>
                <button
                  className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  onClick={() => {
                    void togglePaneVisibility(provider);
                  }}
                  disabled={states[provider].webview !== 'loaded'}
                >
                  {hidden ? 'Show' : 'Hide'}
                </button>
                <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void host.provider.openLogin(provider)}>
                  Login
                </button>
                {provider === 'gemini' ? (
                  <button
                    className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                    onClick={() => void host.provider.openLoginExternal(provider)}
                  >
                    Browser
                  </button>
                ) : null}
                <button
                  className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  onClick={() => {
                    resetProviderBootState(provider);
                    void host.provider.reload(provider).then(() => syncBounds(provider));
                  }}
                >
                  Reload
                </button>
                <button
                  className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void reportProvider(provider)}
                  disabled={reportBusy}
                >
                  Report
                </button>
              </div>
            </div>
            {accessOpen ? <AdapterAccessPanel id={`adapter-access-${provider}`} summary={permissionSummary} /> : null}
            {states[provider].adapter === 'broken' ? (
              <div className="border-b border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">Adapter broken</div>
            ) : null}
            {states[provider].bridge === 'degraded' ? (
              <div className="border-b border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">
                Bridge degraded. Reload suggested.
              </div>
            ) : null}
            {provider === 'gemini' && states[provider].login === 'blocked' ? (
              <div className="flex items-center justify-between gap-2 border-b border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">
                <span>Embedded login blocked. Use your browser, then reload Gemini here.</span>
                <button className="border border-amber-700 px-2 py-1 hover:bg-amber-900" onClick={() => void host.provider.openLoginExternal(provider)}>
                  Open in browser
                </button>
              </div>
            ) : null}
            {states[provider].webview === 'loaded' ? (
              <div className="p-3 text-xs text-zinc-500">{hidden ? 'Native webview hidden; background activity continues.' : 'Native webview mounted here'}</div>
            ) : (
              <div className="grid h-[calc(100%-38px)] place-items-center">
                <button className="border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800" onClick={() => void openProvider(provider)}>
                  Open {AI_PROVIDERS[provider].name}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}

function AdapterAccessPanel({ id, summary }: { id: string; summary: AdapterPermissionSummary }) {
  return (
    <section id={id} className="border-b border-sky-900 bg-sky-950/30 px-3 py-3 text-xs text-zinc-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">What this adapter can access</h3>
        <span className="shrink-0 text-[11px] text-sky-200">{summary.providerName}</span>
      </div>
      <div className="grid gap-3">
        <PermissionGroup title="CAN read (from the page)" lines={summary.reads} />
        <PermissionGroup title="CAN write (to the page)" lines={summary.writes} />
        <PermissionGroup title="CANNOT (guaranteed by architecture)" lines={summary.cannot} />
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

function ReportPreviewDialog({
  preview,
  busy,
  onOpenIssue,
  onCancel,
}: {
  preview: { provider: AIProvider; digest: ReportDigest; body: string };
  busy: boolean;
  onOpenIssue: () => void;
  onCancel: () => void;
}) {
  const digest = preview.digest;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-auto border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-4 border-b border-zinc-800 pb-3">
          <h2 className="text-base font-semibold text-zinc-100">Report preview</h2>
        </div>
        <div className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
          <div>
            Provider: {digest.displayName} ({digest.provider})
          </div>
          <div>Adapter version: {digest.adapterVersion}</div>
          <div>App version: {digest.appVersion}</div>
          <div>Path: {digest.path}</div>
          <div className="sm:col-span-2">First missing field: {digest.firstMissingField ?? 'none'}</div>
        </div>
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap border border-zinc-800 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-200">
          {preview.body}
        </pre>
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
          <button className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onOpenIssue}
            disabled={busy}
          >
            Open GitHub issue
          </button>
        </div>
      </section>
    </div>
  );
}

function adapterNoticeClass(kind: string): string {
  if (kind === 'updated' || kind === 'downgraded') return 'border-emerald-900 bg-emerald-950 text-emerald-200';
  if (kind === 'report-failed') return 'border-red-900 bg-red-950 text-red-200';
  if (kind.endsWith('-failed')) return 'border-amber-900 bg-amber-950 text-amber-200';
  return 'border-zinc-800 bg-zinc-900 text-zinc-200';
}

function adapterNoticeText(notice: AdapterNotice): string {
  const provider = notice.provider in AI_PROVIDERS ? AI_PROVIDERS[notice.provider as AIProvider].name : notice.provider;
  if (notice.kind === 'updated' || notice.kind === 'downgraded') {
    const version = notice.version != null ? ` to v${notice.version}` : '';
    return `${provider} adapter ${notice.kind}${version}.`;
  }
  return `${provider}: ${notice.message || notice.kind}`;
}

function ConnectionBar({
  states,
  mode,
  targets,
  onTargetsChange,
}: {
  states: Record<AIProvider, ProviderState>;
  mode: ChatMode;
  targets: AIProvider[];
  onTargetsChange: (targets: AIProvider[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
      {mode === 'free' ? (
        <TargetChips providers={PROVIDERS} states={states} selected={targets} onChange={onTargetsChange} />
      ) : (
        PROVIDERS.map((provider) => {
          const chip = chipState(states[provider]);
          return (
            <div key={provider} className={`border px-2 py-1 text-xs ${chip.className}`}>
              {AI_PROVIDERS[provider].name}: {chip.label}
            </div>
          );
        })
      )}
    </div>
  );
}

function ChatArea({ messages }: { messages: Bubble[] }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return <div className="p-4 text-sm text-zinc-500">No messages yet.</div>;
  }
  return (
    <div className="space-y-3 p-2">
      {messages.map((message) => (
        <article key={message.id} className="border border-zinc-800 bg-zinc-900 p-3">
          <div className="mb-1 text-xs uppercase text-zinc-500">
            {bubbleAuthorLabel(message)}
            {message.modeRole ? ` · ${message.modeRole}` : ''}
            {message.role === 'ai' && !message.final ? ' streaming' : ''}
          </div>
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
          {message.truncated ? <div className="mt-2 text-xs text-amber-300">(truncated)</div> : null}
        </article>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function chipState(state: ProviderState): { label: string; className: string } {
  if (state.webview !== 'loaded') return { label: 'no-webview', className: 'border-zinc-700 text-zinc-400' };
  if (state.adapter === 'broken') return { label: 'adapter-broken', className: 'border-red-700 text-red-300' };
  if (state.bridge === 'degraded') return { label: 'degraded', className: 'border-amber-700 text-amber-300' };
  if (state.login === 'logged_out' || state.login === 'blocked') return { label: 'needs-login', className: 'border-amber-700 text-amber-300' };
  if (!isSendable(state)) return { label: 'stale', className: 'border-sky-700 text-sky-300' };
  return { label: 'ready', className: 'border-emerald-700 text-emerald-300' };
}
