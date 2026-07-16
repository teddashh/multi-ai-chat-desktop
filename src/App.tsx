import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS, CHAT_MODES, DEFAULT_FREE_TARGET_PROVIDERS } from '../shared/constants';
import type { AIProvider, BridgeMessage, ChatMode, ProviderState } from '../shared/types';
import { startBridgePull, resetProviderBootState } from './bridge/pull';
import { isRenderableResponseMessage } from './bridge/render';
import { publishBridgeMessage } from './bridge/bus';
import { EchoPanel } from './dev/EchoPanel';
import { getRuntimeAppVersion } from './appVersion';
import { host } from './host';
import { useI18n } from './i18n/context';
import { MODE_NAME_KEYS } from './i18n/modes';
import type { Locale } from './i18n/resolve';
import { formatI18n, t as translateKey } from './i18n/t';
import { mergePullBridgeState, type PullBridgeState } from './appBridgeState';
import { onCheckpoint, type PendingCheckpoint } from './workflow/checkpoint';
import { isSendable, onStepTimeoutEvent, runWorkflow } from './workflow';
import { createResponseLanguagePolicy } from './workflow/responseLanguage';
import type { PreflightResult } from './workflow/preflight';
import { bubbleAuthorLabel } from './bubbleAuthorLabel';
import {
  manualFocusLockForControl,
  pointerDebounceLock,
  providerFromRoleAssignment,
  refreshManualLockOnRoleAssignment,
  shouldAutoFocus,
  type ManualFocusLock,
  type ManualFocusPointerDown,
} from './ui/autoFocus';
import { CheckpointCard } from './ui/CheckpointCard';
import { AiSisterAvatar, AiSisterEnsembleCard } from './ui/AiSisterTheme';
import { ConversationSidebar } from './ui/ConversationSidebar';
import {
  createConversationSession,
  loadConversationSessions,
  removeConversationSession,
  saveConversationSessionsWithQuotaRecovery,
  sessionContentChanged,
  titleFromFirstUserMessage,
  upsertConversationSession,
  type ConversationSession,
  type ConversationSessionMessage,
} from './ui/conversationSessions';
import {
  buildConversationReplayContext,
  createActiveProviderResponse,
  createConversationMessageId,
  ensureFreshProviderSessions,
  type ActiveProviderResponse,
} from './ui/conversationContinuity';
import { FocusPane, type CenterSurface } from './ui/FocusPane';
import { InputBar } from './ui/InputBar';
import { MarkdownText } from './ui/MarkdownText';
import { makeFileDragGuard } from './ui/fileDrop';
import { PreflightDialog } from './ui/PreflightDialog';
import { PresetCatalog } from './ui/PresetCatalog';
import { createProcessTrace, reduceProcessTraceEvent, settleProcessTrace, type ProcessTraceState } from './ui/processTraceModel';
import { ReplayPanel, type ReplaySource } from './ui/ReplayPanel';
import { SessionCheckpointNotice } from './ui/SessionCheckpointNotice';
import { loadSessionSidebarCollapsed, saveSessionSidebarCollapsed } from './ui/sessionSidebarPreference';
import { StepTimeoutDialog, type StepTimeoutDialogState } from './ui/StepTimeoutDialog';
import { TargetChips } from './ui/TargetChips';
import { isTranscriptNearEnd, scrollTranscriptToEnd, scrollTranscriptToProviderMessage } from './ui/transcriptScroll';
import {
  DEFAULT_FOCUS_LAYOUT_CONSTRAINTS,
  clampFocusPaneWidth,
  dragFocusPaneWidth,
  driveCenteredProviderToStage as driveCenteredProviderToStageCommand,
  focusGridTemplateColumns,
  nonEmptyRect,
} from './ui/focusLayout';
import { isSerialMode } from './ui/modeRoles';
import {
  centerHiddenProviders,
  centerPresentationProvider,
  defaultPresentation,
  restorableOpenProviders,
  setProviderPresentation,
  type PresentationByProvider,
  type WebviewPresentationState,
} from './ui/presentation';
import {
  applyCenterHiddenCommands,
  applyCenterStageCommand,
  applyPresentationTransitionCommand,
  type PresentationCommandHost,
  waitForPresentationTargetBounds,
} from './ui/presentationCommands';
import { preflightGraph, workflowGraphs } from './workflow/graph';
import { defaultRolesForPreset, PRESET_CATALOG } from './ui/presetCatalogData';
import { buildPreflightDialogModel } from './ui/preflightModel';
import { preflightFromResult } from './ui/preflightFromResult';
import { processingAfterSend, processingAfterSettle, processingAfterWorkflowStatus } from './ui/processing';
import { Resizer } from './ui/Resizer';
import { SettingsModal } from './ui/SettingsModal';
import { defaultSettings, mergeSettings, normalizeSettings, type AppSettings } from './ui/settingsModel';
import {
  clearStartupSessionCheckpointNotice,
  loadStartupSessionCheckpointNotice,
  type StartupSessionCheckpointNotice,
} from './ui/sessionCheckpointStartup';
import { nextStepTimeoutState } from './ui/stepTimeoutState';
import {
  defaultTargets,
  freeModeTargets,
  hasEffectiveFreeModeTargets,
  markFreeTargetsTouched,
  type FreeTargetSelection,
} from './ui/targets';
import { useOverlayGuard } from './ui/useOverlayGuard';
import { buildMarkdown, exportFilename, matchingSnapshotForConversation } from './ui/exportMarkdown';
import { formatReportBody, type AdapterNotice, type ReportDigest } from './ui/reportBroken';
import { persistSnapshotIfEnabled } from './workflow/snapshot/persistence';
import { getLastSnapshot } from './workflow/snapshot/recorder';
import type { ReplayPlan } from './workflow/snapshot/replay';
import type { ExecutionSnapshot } from './workflow/snapshot/types';
import {
  eventFromAdapterNotice,
  eventFromBridgeMessage,
  eventFromNavBlocked,
  eventFromProviderState,
  eventFromStepTimeout,
  eventFromWorkflowPreflightBlocked,
  eventFromWorkflowSettled,
  eventFromWorkflowStart,
} from './diagnostics/eventLog';
import { recordEventLog } from './diagnostics/eventLogStore';
import { ModalDialog } from './ui/ModalDialog';

interface Bubble {
  id: string;
  provider?: AIProvider | 'system' | (string & {});
  authorLabel?: string;
  role: 'user' | 'ai';
  content: string;
  final?: boolean;
  truncated?: boolean;
  modeRole?: string;
}

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

function initialConversationState(): { sessions: ConversationSession[]; active: ConversationSession } {
  const loaded = loadConversationSessions();
  const active = loaded[0] ?? createConversationSession();
  return { sessions: upsertConversationSession(loaded, active), active };
}

function conversationMessages(messages: readonly Bubble[]): ConversationSessionMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.authorLabel ? { authorLabel: message.authorLabel } : {}),
    ...(message.modeRole ? { modeRole: message.modeRole } : {}),
    ...(typeof message.final === 'boolean' ? { final: message.final } : {}),
    ...(typeof message.truncated === 'boolean' ? { truncated: message.truncated } : {}),
  }));
}

function persistConversationSessions(sessions: readonly ConversationSession[]): ConversationSession[] {
  const result = saveConversationSessionsWithQuotaRecovery(sessions);
  if (!result.saved) {
    recordEventLog({
      kind: 'workflow-error',
      summary: 'Conversation history save failed; recent messages may be lost on restart',
      detail: { sessions: sessions.length, reason: result.reason ?? 'unknown' },
    });
    return [...sessions];
  }
  if (result.evictedSessionIds.length > 0) {
    recordEventLog({
      kind: 'workflow-error',
      summary: 'Oldest conversation history was removed to stay within local storage quota',
      detail: { evictedSessionIds: result.evictedSessionIds.join(',') },
    });
  }
  return result.sessions;
}

function bubblesFromSession(session: ConversationSession): Bubble[] {
  return session.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.authorLabel ? { authorLabel: message.authorLabel } : {}),
    ...(message.modeRole ? { modeRole: message.modeRole } : {}),
    ...(typeof message.final === 'boolean' ? { final: message.final } : {}),
    ...(typeof message.truncated === 'boolean' ? { truncated: message.truncated } : {}),
  }));
}

const presentationHost: PresentationCommandHost = {
  close: host.provider.close,
  hide: (provider) => host.provider.park(provider, hiddenProviderLoadBounds()),
  open: host.provider.open,
  setBounds: host.layout.setBounds,
  show: host.provider.show,
};

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function providerSetEquals(left: ReadonlySet<AIProvider>, right: ReadonlySet<AIProvider>): boolean {
  if (left.size !== right.size) return false;
  for (const provider of left) {
    if (!right.has(provider)) return false;
  }
  return true;
}

function hiddenProviderLoadBounds(): DOMRectReadOnly {
  return {
    x: -10_000,
    y: -10_000,
    width: 420,
    height: 320,
    top: -10_000,
    left: -10_000,
    right: -9_580,
    bottom: -9_680,
    toJSON: () => ({}),
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function presentationHiddenProvidersForCenterSurface({
  centerSurface,
  presentation,
  states,
  userHidden,
  providers,
  centerTransitionsInFlight = new Set(),
}: {
  centerSurface: CenterSurface;
  presentation: PresentationByProvider;
  states: Record<AIProvider, ProviderState>;
  userHidden: ReadonlySet<AIProvider>;
  providers: readonly AIProvider[];
  centerTransitionsInFlight?: ReadonlySet<AIProvider>;
}): Set<AIProvider> {
  if (centerSurface === 'native') {
    return new Set(centerHiddenProviders(presentation, states, userHidden, providers, centerTransitionsInFlight));
  }

  const centered = centerPresentationProvider(presentation);
  if (!centered) return new Set();
  if (states[centered]?.webview !== 'loaded' && !centerTransitionsInFlight.has(centered)) return new Set();
  return new Set([centered]);
}

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

function isGeneratedImageResponse(content: string): boolean {
  return /^\[Image generated(?::[^\]]+)?\]$/.test(content.trim());
}

export default function App() {
  const { locale, t: translate, setLanguage } = useI18n();
  useEffect(() => {
    void Promise.resolve()
      .then(() => host.dev.log('[MAC_AGENT] READY control-pane'))
      .catch(() => undefined);
  }, []);
  const initialConversation = useMemo(initialConversationState, []);
  const [states, setStates] = useState<Record<AIProvider, ProviderState>>(() =>
    Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider,
        { provider, webview: 'none', dom: 'unknown', login: 'unknown', thinking: false, lastStatusAt: 0 },
      ]),
    ) as Record<AIProvider, ProviderState>,
  );
  const [sessions, setSessions] = useState<ConversationSession[]>(initialConversation.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialConversation.active.id);
  const [sessionSidebarCollapsed, setSessionSidebarCollapsed] = useState(loadSessionSidebarCollapsed);
  const [messages, setMessages] = useState<Bubble[]>(() => bubblesFromSession(initialConversation.active));
  const [workflowStatus, setWorkflowStatus] = useState('');
  const [mode, setMode] = useState<ChatMode>(initialConversation.active.mode);
  const [presetDetailsMode, setPresetDetailsMode] = useState<ChatMode | undefined>();
  const [replayDrawerOpen, setReplayDrawerOpen] = useState(false);
  const [processTrace, setProcessTrace] = useState<ProcessTraceState | undefined>();
  const [processTraceDetailOpen, setProcessTraceDetailOpen] = useState(false);
  const [targetSelection, setTargetSelection] = useState<FreeTargetSelection>(() => ({
    targets: [...DEFAULT_FREE_TARGET_PROVIDERS],
    defaultsInitialized: true,
    userTouched: false,
  }));
  const [checkpoint, setCheckpoint] = useState<PendingCheckpoint | undefined>();
  const [checkpointDraft, setCheckpointDraft] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [preflight, setPreflight] = useState<{ mode: Exclude<ChatMode, 'free'>; result: PreflightResult } | undefined>();
  const [stepTimeout, setStepTimeout] = useState<StepTimeoutDialogState | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>();
  const [sessionCheckpointNotice, setSessionCheckpointNotice] = useState<StartupSessionCheckpointNotice | undefined>();
  const [sessionCheckpointReplayBusy, setSessionCheckpointReplayBusy] = useState(false);
  const [reportPreview, setReportPreview] = useState<{ provider: AIProvider; digest: ReportDigest; body: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [adapterNotice, setAdapterNotice] = useState<AdapterNotice | null>(null);
  const [sharing, setSharing] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => defaultSettings());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [initialRestoreComplete, setInitialRestoreComplete] = useState(false);
  const [connectionSnapshotLoaded, setConnectionSnapshotLoaded] = useState(false);
  const [focusPaneWidth, setFocusPaneWidth] = useState(() => defaultSettings().focusPaneWidth);
  const [presentation, setPresentation] = useState<PresentationByProvider>(() => defaultPresentation());
  const [centerSurface, setCenterSurface] = useState<CenterSurface>('text');
  const [userHidden, setUserHidden] = useState<Set<AIProvider>>(() => new Set());
  const [centerHidden, setCenterHidden] = useState<Set<AIProvider>>(() => new Set());
  const [centerTransitionsInFlight, setCenterTransitionsInFlight] = useState<Set<AIProvider>>(() => new Set());
  const paneRefs = useRef<Record<string, HTMLElement | null>>({});
  const centerStageRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptStickToEndRef = useRef(true);
  const transcriptSessionRef = useRef<string>();
  const transcriptLastMessageIdRef = useRef<string>();
  const statesRef = useRef(states);
  const userHiddenRef = useRef<Set<AIProvider>>(userHidden);
  const settingsRef = useRef<AppSettings>(appSettings);
  const localeRef = useRef(locale);
  const autoFollowEnabledRef = useRef(true);
  const manualFocusLockRef = useRef<ManualFocusLock | undefined>();
  const manualFocusPointerDownRef = useRef<ManualFocusPointerDown | undefined>();
  const manualFocusIdlePausedRef = useRef(false);
  const manualFocusIdlePauseStartedAtRef = useRef<number | undefined>();
  const presentationRef = useRef<PresentationByProvider>(presentation);
  const centerSurfaceRef = useRef<CenterSurface>(centerSurface);
  const forcedNativeCenterProviderRef = useRef<AIProvider | undefined>();
  const changeProviderPresentationRef = useRef<(provider: AIProvider, state: WebviewPresentationState) => Promise<void>>(async () => {});
  const centerHiddenRef = useRef<Set<AIProvider>>(centerHidden);
  const centerTransitionsInFlightRef = useRef<Set<AIProvider>>(centerTransitionsInFlight);
  const centerTransitionGenerations = useRef<Map<AIProvider, number>>(new Map());
  const presentationTransitionGenerations = useRef<Record<AIProvider, number>>(
    Object.fromEntries(PROVIDERS.map((provider) => [provider, 0])) as Record<AIProvider, number>,
  );
  const overlayGuardOpenRef = useRef(false);
  const pendingRestore = useRef<Set<AIProvider>>(new Set());
  const dragStartFocusPaneWidth = useRef(defaultSettings().focusPaneWidth);
  const activeResponses = useRef(new Map<AIProvider, ActiveProviderResponse>());
  const replayContextSessionRef = useRef<string | undefined>(
    initialConversation.active.messages.length > 0 ? initialConversation.active.id : undefined,
  );
  const pendingProviderResetRef = useRef<Set<AIProvider>>(new Set());
  const pullBridge = useRef(new Map<AIProvider, PullBridgeState>());
  const replayPanelRef = useRef<ReplayPanel | null>(null);
  const targets = targetSelection.targets;
  const centeredProvider = useMemo(() => centerPresentationProvider(presentation), [presentation]);
  const presentationHidden = useMemo(() => {
    const next = new Set(centerHidden);
    if (centerSurface === 'text' && centeredProvider) next.add(centeredProvider);
    return next;
  }, [centerHidden, centeredProvider, centerSurface]);
  const modalHiddenProviders = useMemo(() => {
    const next = new Set<AIProvider>([...userHidden, ...presentationHidden]);
    return next;
  }, [presentationHidden, userHidden]);
  const loadedModalProviders = useMemo(() => {
    const centered = centerPresentationProvider(presentation);
    if (centerSurface !== 'native' || !centered) return [];
    if (states[centered].webview !== 'loaded') return [];
    if (modalHiddenProviders.has(centered)) return [];
    return [centered];
  }, [centerSurface, modalHiddenProviders, presentation, states]);
  const hasFreeModeTargets = useMemo(() => hasEffectiveFreeModeTargets(targets, states), [states, targets]);
  const anySendableTargets = useMemo(() => defaultTargets(states, PROVIDERS), [states]);
  const requiredModeProviders = useMemo(
    () => PRESET_CATALOG.find((preset) => preset.graphId === mode)?.requiredProviders ?? [],
    [mode],
  );
  const readyModeProviders = useMemo(
    () => requiredModeProviders.filter((provider) => isSendable(states[provider])),
    [requiredModeProviders, states],
  );
  const missingModeProviderCount = Math.max(0, requiredModeProviders.length - readyModeProviders.length);
  const noSendableProviders = mode === 'free' ? !hasFreeModeTargets : anySendableTargets.length === 0;
  const modeSendBlocked = mode !== 'free' && missingModeProviderCount > 0;
  const openProviders = useMemo(() => PROVIDERS.filter((provider) => states[provider].webview === 'loaded'), [states]);
  const latestCenterBubble = useMemo(() => {
    if (!centeredProvider) return undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'ai' && message.provider === centeredProvider) return message;
    }
    return undefined;
  }, [centeredProvider, messages]);
  const centerText = latestCenterBubble?.content;
  const centerTextFinal = latestCenterBubble?.final === true;

  const overlayGuardOpen =
    Boolean(preflight) || Boolean(stepTimeout?.timedOut) || settingsOpen || Boolean(reportPreview) || processTraceDetailOpen;
  const manualFocusIdlePaused = Boolean(checkpoint) || Boolean(stepTimeout);
  overlayGuardOpenRef.current = overlayGuardOpen;

  const setCenterSurfaceMode = useCallback((surface: CenterSurface) => {
    centerSurfaceRef.current = surface;
    setCenterSurface(surface);
  }, []);

  useEffect(() => {
    if (centeredProvider && forcedNativeCenterProviderRef.current === centeredProvider) {
      forcedNativeCenterProviderRef.current = undefined;
      setCenterSurfaceMode('native');
      return;
    }
    forcedNativeCenterProviderRef.current = undefined;
    setCenterSurfaceMode('text');
  }, [centeredProvider, setCenterSurfaceMode]);

  useOverlayGuard(overlayGuardOpen, loadedModalProviders);

  useEffect(() => {
    const guard = makeFileDragGuard();
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  useEffect(() => {
    statesRef.current = states;
  }, [states]);

  useEffect(() => {
    userHiddenRef.current = userHidden;
  }, [userHidden]);

  useEffect(() => {
    settingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', appSettings.theme !== 'light');
    document.documentElement.classList.toggle('ai-sister', appSettings.theme === 'ai-sister');
  }, [appSettings.theme]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${appSettings.fontSize}px`;
  }, [appSettings.fontSize]);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    saveSessionSidebarCollapsed(sessionSidebarCollapsed);
  }, [sessionSidebarCollapsed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSessions((current) => {
        const existing = current.find((session) => session.id === activeSessionId);
        const storedMessages = conversationMessages(messages);
        if (existing && !sessionContentChanged(existing, storedMessages, mode)) return current;
        const base = existing ?? createConversationSession({ id: activeSessionId, mode });
        const next = upsertConversationSession(current, {
          ...base,
          title: titleFromFirstUserMessage(storedMessages),
          updatedAt: Date.now(),
          mode,
          messages: storedMessages,
        });
        return persistConversationSessions(next);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeSessionId, messages, mode]);

  const setManualFocusLock = useCallback((lock: ManualFocusLock | undefined) => {
    manualFocusLockRef.current = lock;
  }, []);

  const markManualFocusControl = useCallback((provider: AIProvider) => {
    const now = Date.now();
    manualFocusPointerDownRef.current = { provider, at: now };
    const lock = manualFocusLockForControl(provider, presentationRef.current[provider], now);
    if (lock) setManualFocusLock(lock);
  }, [setManualFocusLock]);

  useEffect(() => {
    presentationRef.current = presentation;
  }, [presentation]);

  useEffect(() => {
    centerHiddenRef.current = centerHidden;
  }, [centerHidden]);

  useEffect(() => {
    centerTransitionsInFlightRef.current = centerTransitionsInFlight;
  }, [centerTransitionsInFlight]);

  useEffect(() => {
    return onCheckpoint((pending) => {
      setCheckpoint(pending);
      setCheckpointDraft(pending?.draft ?? '');
    });
  }, []);

  useEffect(() => {
    manualFocusIdlePausedRef.current = manualFocusIdlePaused;
    if (manualFocusIdlePaused) {
      manualFocusIdlePauseStartedAtRef.current ??= Date.now();
      return;
    }

    if (manualFocusIdlePauseStartedAtRef.current !== undefined) {
      manualFocusIdlePauseStartedAtRef.current = undefined;
      if (manualFocusLockRef.current) setManualFocusLock({ ...manualFocusLockRef.current, at: Date.now() });
    }
  }, [manualFocusIdlePaused, setManualFocusLock]);

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
    let disposed = false;
    void loadStartupSessionCheckpointNotice()
      .then((notice) => {
        if (!disposed) setSessionCheckpointNotice(notice);
      })
      .catch(() => {
        // Startup interruption detection is best-effort.
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void host.adapter
      .onNotice((notice) => {
        setAdapterNotice(notice);
        recordEventLog(eventFromAdapterNotice(notice));
      })
      .then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void host.onNavBlocked((payload) => {
      recordEventLog(eventFromNavBlocked(payload));
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const persistSettingsPatch = useCallback(async (patch: Partial<AppSettings>) => {
    const next = mergeSettings(settingsRef.current, patch);
    settingsRef.current = next;
    setAppSettings(next);
    setLanguage(next.language);
    await host.settings.set(next);
  }, [setLanguage]);

  useEffect(() => {
    let disposed = false;
    void host.settings
      .get()
      .then((value) => {
        if (disposed) return;
        const loaded = normalizeSettings(value);
        settingsRef.current = loaded;
        setAppSettings(loaded);
        setLanguage(loaded.language);
        setFocusPaneWidth(loaded.focusPaneWidth);
        setPresentation(loaded.presentation);
        pendingRestore.current = new Set(restorableOpenProviders(loaded.openProviders, loaded.presentation));
        setInitialRestoreComplete(pendingRestore.current.size === 0);
      })
      .catch(() => {
        if (disposed) return;
        const defaults = defaultSettings();
        settingsRef.current = defaults;
        setAppSettings(defaults);
        setLanguage(defaults.language);
        setPresentation(defaults.presentation);
        setInitialRestoreComplete(true);
      })
      .finally(() => {
        if (!disposed) setSettingsLoaded(true);
      });
    return () => {
      disposed = true;
    };
  }, [setLanguage]);

  useEffect(() => {
    const handleBridgeMessage = (message: BridgeMessage) => {
      recordEventLog(eventFromBridgeMessage(message));
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
        setProcessTrace((current) => (current ? reduceProcessTraceEvent(current, message, localeRef.current) : current));
        if (status === '') {
          setManualFocusLock(undefined);
          setStepTimeout((current) => nextStepTimeoutState(current, { type: 'settle' }));
        }
        setIsProcessing((current) => processingAfterWorkflowStatus(current, status));
        return;
      }
      if (message.action === 'ROLE_ASSIGNMENT') {
        const provider = providerFromRoleAssignment(message);
        if (!provider) return;
        const payload = message.payload as { label?: unknown } | undefined;
        activeResponses.current.set(
          provider,
          createActiveProviderResponse(provider, typeof payload?.label === 'string' ? payload.label : undefined),
        );
        setProcessTrace((current) => (current ? reduceProcessTraceEvent(current, message, localeRef.current) : current));
        const now = Date.now();
        const refreshedLock = refreshManualLockOnRoleAssignment(manualFocusLockRef.current, now, {
          idlePaused: manualFocusIdlePausedRef.current,
        });
        setManualFocusLock(refreshedLock);
        const manualLock = refreshedLock ?? pointerDebounceLock(manualFocusPointerDownRef.current, now);
        if (
          shouldAutoFocus({
            autoFollowEnabled: autoFollowEnabledRef.current,
            manualLock,
            candidate: provider,
            centered: centerPresentationProvider(presentationRef.current),
          })
        ) {
          void changeProviderPresentationRef.current(provider, 'center');
        }
        return;
      }
      if (!isRenderableResponseMessage(message) || !message.provider) return;
      setProcessTrace((current) => (current ? reduceProcessTraceEvent(current, message, localeRef.current) : current));
      let active = activeResponses.current.get(message.provider);
      if (!active) {
        active = createActiveProviderResponse(message.provider);
        activeResponses.current.set(message.provider, active);
      }
      const { content, truncated } = renderablePayload(message.payload);
      if (
        message.action === 'RESPONSE_DONE' &&
        isGeneratedImageResponse(content) &&
        centerPresentationProvider(presentationRef.current) === message.provider
      ) {
        setCenterSurfaceMode('native');
      }
      setMessages((current) => {
        const id = active.id;
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
        activeResponses.current.delete(message.provider);
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
      const mergedSnapshot = snapshot.map((state) => mergePullBridgeState(state, pullBridge.current.get(state.provider)));
      for (const state of mergedSnapshot) recordEventLog(eventFromProviderState(state, 'snapshot'));
      setStates((current) => ({
        ...current,
        ...Object.fromEntries(mergedSnapshot.map((state) => [state.provider, state])),
      }));
      setConnectionSnapshotLoaded(true);
    });
    void host.connections.onUpdate((state) => {
      const merged = mergePullBridgeState(state, pullBridge.current.get(state.provider));
      recordEventLog(eventFromProviderState(merged));
      setStates((current) => ({ ...current, [state.provider]: merged }));
    }).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupUpdates = cleanup;
    });
    void host.bridge.onMessage(handleBridgeMessage).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupBridge = cleanup;
    });
    const cleanupTimeout = onStepTimeoutEvent((event) => {
      recordEventLog(eventFromStepTimeout(event));
      setStepTimeout((current) => nextStepTimeoutState(current, event));
    });

    return () => {
      disposed = true;
      cleanupPull?.();
      cleanupUpdates?.();
      cleanupBridge?.();
      cleanupTimeout();
    };
  }, [setCenterSurfaceMode, setManualFocusLock]);

  const handleTargetsChange = useCallback((nextTargets: AIProvider[]) => {
    setTargetSelection((current) => markFreeTargetsTouched(current, nextTargets));
  }, []);

  const boundsForProvider = useCallback((provider: AIProvider): DOMRectReadOnly | undefined => {
    if (presentationRef.current[provider] === 'center') {
      return nonEmptyRect(centerStageRef.current?.getBoundingClientRect());
    }
    return nonEmptyRect(paneRefs.current[provider]?.getBoundingClientRect());
  }, []);

  const fallbackBoundsForProvider = useCallback(
    (provider: AIProvider): DOMRectReadOnly => boundsForProvider(provider) ?? new DOMRect(24, 24, 420, 320),
    [boundsForProvider],
  );

  const boundsForPresentationTarget = useCallback((_provider: AIProvider, state: WebviewPresentationState): DOMRectReadOnly | undefined => {
    if (state === 'center') return nonEmptyRect(centerStageRef.current?.getBoundingClientRect());
    if (state === 'side') return hiddenProviderLoadBounds();
    return undefined;
  }, []);

  const beginPresentationTransition = useCallback((provider: AIProvider): number => {
    const generation = presentationTransitionGenerations.current[provider] + 1;
    presentationTransitionGenerations.current[provider] = generation;
    return generation;
  }, []);

  const presentationTransitionCurrent = useCallback(
    (provider: AIProvider, state: WebviewPresentationState, generation: number): boolean =>
      presentationTransitionGenerations.current[provider] === generation && presentationRef.current[provider] === state,
    [],
  );

  const publishCenterTransitionsInFlight = useCallback(() => {
    const next = new Set(centerTransitionGenerations.current.keys());
    centerTransitionsInFlightRef.current = next;
    setCenterTransitionsInFlight(next);
  }, []);

  const startCenterTransitionInFlight = useCallback(
    (provider: AIProvider, generation: number) => {
      centerTransitionGenerations.current.set(provider, generation);
      publishCenterTransitionsInFlight();
    },
    [publishCenterTransitionsInFlight],
  );

  const clearCenterTransitionInFlight = useCallback(
    (provider: AIProvider, generation?: number) => {
      if (generation !== undefined && centerTransitionGenerations.current.get(provider) !== generation) return;
      if (!centerTransitionGenerations.current.delete(provider)) return;
      publishCenterTransitionsInFlight();
    },
    [publishCenterTransitionsInFlight],
  );

  const clearUserHiddenProvider = useCallback((provider: AIProvider) => {
    setUserHidden((current) => {
      if (!current.has(provider)) {
        userHiddenRef.current = current;
        return current;
      }
      const copy = new Set(current);
      copy.delete(provider);
      userHiddenRef.current = copy;
      return copy;
    });
  }, []);

  const waitForProviderPresentationBounds = useCallback(
    (provider: AIProvider, state: WebviewPresentationState, generation: number): Promise<DOMRectReadOnly | undefined> =>
      waitForPresentationTargetBounds({
        getBounds: () => boundsForPresentationTarget(provider, state),
        waitFrame: nextAnimationFrame,
        shouldContinue: () =>
          presentationTransitionCurrent(provider, state, generation) &&
          (state !== 'center' || (centerSurfaceRef.current === 'native' && !overlayGuardOpenRef.current)),
      }),
    [boundsForPresentationTarget, presentationTransitionCurrent],
  );

  const openProvider = useCallback(async (provider: AIProvider) => {
    const rect = fallbackBoundsForProvider(provider);
    resetProviderBootState(provider);
    await host.provider.open(provider, rect);
  }, [fallbackBoundsForProvider]);

  const ensureProviderLoadedHidden = useCallback(
    async (provider: AIProvider, bounds: DOMRectReadOnly, shouldContinue: () => boolean = () => true) => {
      if (!shouldContinue()) return;
      if (statesRef.current[provider].webview !== 'loaded') {
        resetProviderBootState(provider);
        await host.provider.open(provider, bounds);
      }
      if (!shouldContinue()) return;
      await host.provider.park(provider, bounds);
    },
    [],
  );

  const restoreProvider = useCallback(
    async (provider: AIProvider) => {
      const target = presentationRef.current[provider];
      if (target === 'chip') return;
      if (target === 'side') {
        await ensureProviderLoadedHidden(
          provider,
          hiddenProviderLoadBounds(),
          () => presentationRef.current[provider] === 'side',
        );
        return;
      }
      if (target === 'center' && centerSurfaceRef.current === 'text') {
        await ensureProviderLoadedHidden(
          provider,
          hiddenProviderLoadBounds(),
          () => presentationRef.current[provider] === 'center' && centerSurfaceRef.current === 'text',
        );
        return;
      }
      await openProvider(provider);
    },
    [ensureProviderLoadedHidden, openProvider],
  );

  const syncBounds = useCallback(async (provider: AIProvider) => {
    if (statesRef.current[provider].webview !== 'loaded') return;
    const shouldPaintCenter =
      presentationRef.current[provider] === 'center' &&
      centerSurfaceRef.current === 'native' &&
      !userHiddenRef.current.has(provider) &&
      !overlayGuardOpenRef.current;
    if (!shouldPaintCenter) {
      await host.provider.park(provider, hiddenProviderLoadBounds());
      return;
    }
    const rect = boundsForProvider(provider);
    if (!rect) return;
    await host.layout.setBounds(provider, rect);
  }, [boundsForProvider]);

  const syncAllBounds = useCallback(() => {
    for (const provider of PROVIDERS) {
      void syncBounds(provider);
    }
  }, [syncBounds]);

  const driveCenteredProviderToStage = useCallback(async (provider: AIProvider) => {
    if (centerSurfaceRef.current !== 'native') return;
    // overlay(設定、preflight 等)開啟時 guard 已 hide webview；此處若照常把
    // bounds 推回舞台，syncBounds 的 park→show 會讓 webview 重新蓋在 overlay 上。
    if (overlayGuardOpenRef.current) return;
    await driveCenteredProviderToStageCommand({
      provider,
      presentation: presentationRef.current[provider],
      webview: statesRef.current[provider].webview,
      bounds: centerStageRef.current?.getBoundingClientRect(),
      setBounds: host.layout.setBounds,
    });
  }, []);

  const setPaneRef = useCallback(
    (provider: AIProvider, el: HTMLElement | null) => {
      paneRefs.current[provider] = el;
      if (!el) return;
      void syncBounds(provider);
      if (pendingRestore.current.has(provider)) {
        pendingRestore.current.delete(provider);
        void restoreProvider(provider).finally(() => {
          if (pendingRestore.current.size === 0) setInitialRestoreComplete(true);
        });
      }
    },
    [restoreProvider, syncBounds],
  );

  const setCenterStageRef = useCallback(
    (el: HTMLDivElement | null) => {
      centerStageRef.current = el;
      if (!el) return;
      const provider = centerPresentationProvider(presentationRef.current);
      if (!provider) return;
      if (centerSurfaceRef.current === 'native') void syncBounds(provider);
      if (pendingRestore.current.has(provider)) {
        pendingRestore.current.delete(provider);
        void restoreProvider(provider).finally(() => {
          if (pendingRestore.current.size === 0) setInitialRestoreComplete(true);
        });
      }
    },
    [restoreProvider, syncBounds],
  );

  useEffect(() => {
    if (!settingsLoaded || initialRestoreComplete || pendingRestore.current.size === 0) return;

    for (const provider of Array.from(pendingRestore.current)) {
      const state = presentation[provider];
      if (state === 'chip') {
        pendingRestore.current.delete(provider);
        continue;
      }
      const hasPlaceholder = state === 'center' ? Boolean(centerStageRef.current) : Boolean(paneRefs.current[provider]);
      if (!hasPlaceholder) continue;
      pendingRestore.current.delete(provider);
      void restoreProvider(provider).finally(() => {
        if (pendingRestore.current.size === 0) setInitialRestoreComplete(true);
      });
    }

    if (pendingRestore.current.size === 0) setInitialRestoreComplete(true);
  }, [centeredProvider, initialRestoreComplete, presentation, restoreProvider, settingsLoaded]);

  const persistPresentation = useCallback(
    async (next: PresentationByProvider) => {
      presentationRef.current = next;
      setPresentation(next);
      await persistSettingsPatch({ presentation: next });
      if (presentationRef.current !== next) {
        await host.settings.set(settingsRef.current);
      }
    },
    [persistSettingsPatch],
  );

  const hideCenterSiblingsForTransition = useCallback(
    async (provider: AIProvider, generation: number) => {
      if (centerSurfaceRef.current !== 'native') return;
      const previous = centerHiddenRef.current;
      const next = new Set(
        centerHiddenProviders(
          presentationRef.current,
          statesRef.current,
          userHiddenRef.current,
          PROVIDERS,
          centerTransitionsInFlightRef.current,
        ),
      );
      const snapshot = () => ({
        states: statesRef.current,
        presentation: presentationRef.current,
        userHidden: userHiddenRef.current,
        overlayGuardOpen: overlayGuardOpenRef.current,
      });
      const shouldContinueNative = () => presentationTransitionCurrent(provider, 'center', generation) && centerSurfaceRef.current === 'native';

      await applyCenterHiddenCommands({
        host: presentationHost,
        previousHidden: previous,
        nextHidden: next,
        snapshot,
        shouldContinue: shouldContinueNative,
        restoreRemoved: false,
      });

      if (shouldContinueNative() && !providerSetEquals(previous, next)) {
        centerHiddenRef.current = next;
        setCenterHidden(next);
      } else if (centerSurfaceRef.current !== 'native') {
        await applyCenterHiddenCommands({
          host: presentationHost,
          previousHidden: next,
          nextHidden: new Set(),
          snapshot,
          shouldContinue: () => centerSurfaceRef.current !== 'native',
        });
      }
    },
    [presentationTransitionCurrent],
  );

  const changeProviderPresentation = useCallback(
    async (provider: AIProvider, state: WebviewPresentationState) => {
      const generation = beginPresentationTransition(provider);
      const next = setProviderPresentation(presentationRef.current, provider, state);
      if (state === 'center') startCenterTransitionInFlight(provider, generation);
      else clearCenterTransitionInFlight(provider);

      await persistPresentation(next);
      clearUserHiddenProvider(provider);

      if (state === 'chip') {
        await applyPresentationTransitionCommand({
          host: presentationHost,
          provider,
          state,
          bounds: new DOMRect(0, 0, 0, 0),
          webview: statesRef.current[provider].webview,
          currentWebview: () => statesRef.current[provider].webview,
          shouldContinue: () => presentationTransitionCurrent(provider, state, generation),
        });
        if (presentationTransitionCurrent(provider, state, generation)) resetProviderBootState(provider);
        return;
      }

      const ensureTextCenterLoadedHidden = async () => {
        try {
          await ensureProviderLoadedHidden(
            provider,
            hiddenProviderLoadBounds(),
            () => presentationTransitionCurrent(provider, 'center', generation) && centerSurfaceRef.current === 'text',
          );
        } catch (error) {
          clearCenterTransitionInFlight(provider, generation);
          throw error;
        }
      };

      if (state === 'center' && centerSurfaceRef.current !== 'native') {
        await ensureTextCenterLoadedHidden();
        return;
      }

      const bounds = await waitForProviderPresentationBounds(provider, state, generation);
      if (!bounds) {
        if (state === 'center' && centerSurfaceRef.current === 'text') {
          await ensureTextCenterLoadedHidden();
        } else if (state === 'center') {
          clearCenterTransitionInFlight(provider, generation);
        }
        return;
      }

      if (state === 'center' && centerSurfaceRef.current !== 'native') {
        await ensureTextCenterLoadedHidden();
        return;
      }

      if (state === 'center') await hideCenterSiblingsForTransition(provider, generation);
      if (!presentationTransitionCurrent(provider, state, generation)) return;

      try {
        const shouldContinue = () =>
          presentationTransitionCurrent(provider, state, generation) &&
          (state !== 'center' || (centerSurfaceRef.current === 'native' && !overlayGuardOpenRef.current && !userHiddenRef.current.has(provider)));
        if (statesRef.current[provider].webview !== 'loaded') resetProviderBootState(provider);
        await applyPresentationTransitionCommand({
          host: presentationHost,
          provider,
          state,
          bounds,
          webview: statesRef.current[provider].webview,
          currentWebview: () => statesRef.current[provider].webview,
          shouldContinue,
        });
        if (state === 'center' && !shouldContinue() && statesRef.current[provider].webview === 'loaded') {
          await host.provider.park(provider, hiddenProviderLoadBounds());
        }
      } catch (error) {
        if (state === 'center') clearCenterTransitionInFlight(provider, generation);
        throw error;
      }
    },
    [
      beginPresentationTransition,
      clearCenterTransitionInFlight,
      clearUserHiddenProvider,
      ensureProviderLoadedHidden,
      hideCenterSiblingsForTransition,
      persistPresentation,
      presentationTransitionCurrent,
      startCenterTransitionInFlight,
      waitForProviderPresentationBounds,
    ],
  );

  useEffect(() => {
    changeProviderPresentationRef.current = changeProviderPresentation;
  }, [changeProviderPresentation]);

  const forceProviderNativeCenter = useCallback(
    async (provider: AIProvider) => {
      forcedNativeCenterProviderRef.current = provider;
      setCenterSurfaceMode('native');
      markManualFocusControl(provider);
      try {
        await changeProviderPresentationRef.current(provider, 'center');
      } finally {
        if (centerPresentationProvider(presentationRef.current) === provider) {
          setCenterSurfaceMode('native');
        } else if (forcedNativeCenterProviderRef.current === provider) {
          forcedNativeCenterProviderRef.current = undefined;
        }
      }
    },
    [markManualFocusControl, setCenterSurfaceMode],
  );

  const changeProviderPresentationManually = useCallback(
    async (provider: AIProvider, state: WebviewPresentationState) => {
      markManualFocusControl(provider);
      await changeProviderPresentation(provider, state);
    },
    [changeProviderPresentation, markManualFocusControl],
  );

  const autoFocusRunCandidate = useCallback((candidate: AIProvider | undefined) => {
    if (!candidate) return;
    const now = Date.now();
    const refreshedLock = refreshManualLockOnRoleAssignment(manualFocusLockRef.current, now, {
      idlePaused: manualFocusIdlePausedRef.current,
    });
    setManualFocusLock(refreshedLock);
    const manualLock = refreshedLock ?? pointerDebounceLock(manualFocusPointerDownRef.current, now);
    if (
      shouldAutoFocus({
        autoFollowEnabled: autoFollowEnabledRef.current,
        manualLock,
        candidate,
        centered: centerPresentationProvider(presentationRef.current),
      })
    ) {
      void changeProviderPresentationRef.current(candidate, 'center');
    }
  }, [setManualFocusLock]);

  useEffect(() => {
    const nativeCenterSurface = centerSurfaceRef.current === 'native';
    const next = presentationHiddenProvidersForCenterSurface({
      centerSurface: nativeCenterSurface ? 'native' : 'text',
      presentation,
      states,
      userHidden,
      providers: PROVIDERS,
      centerTransitionsInFlight,
    });
    const previous = centerHiddenRef.current;
    const centered = centerPresentationProvider(presentation);
    const snapshot = () => ({
      states: statesRef.current,
      presentation: presentationRef.current,
      userHidden: userHiddenRef.current,
      overlayGuardOpen: overlayGuardOpenRef.current,
    });

    if (centered && states[centered].webview === 'loaded') {
      if (nativeCenterSurface) {
        const bounds = nonEmptyRect(centerStageRef.current?.getBoundingClientRect());
        if (bounds) {
          const shouldPaintCenter = () =>
            presentationRef.current[centered] === 'center' &&
            centerSurfaceRef.current === 'native' &&
            !userHiddenRef.current.has(centered) &&
            !overlayGuardOpenRef.current;
          void (async () => {
            await applyPresentationTransitionCommand({
              host: presentationHost,
              provider: centered,
              state: 'center',
              bounds,
              webview: statesRef.current[centered].webview,
              currentWebview: () => statesRef.current[centered].webview,
              shouldContinue: shouldPaintCenter,
            });
            if (!shouldPaintCenter()) {
              if (presentationRef.current[centered] === 'center' && statesRef.current[centered].webview === 'loaded') {
                await host.provider.park(centered, hiddenProviderLoadBounds());
              }
              return;
            }
            await applyCenterStageCommand({
              host: presentationHost,
              provider: centered,
              bounds,
              overlappingProviders: Array.from(next),
              currentWebview: (candidate) => statesRef.current[candidate].webview,
              shouldContinue: () => presentationRef.current[centered] === 'center' && centerSurfaceRef.current === 'native',
            });
            if (centerSurfaceRef.current !== 'native') {
              if (presentationRef.current[centered] === 'center' && statesRef.current[centered].webview === 'loaded') {
                await host.provider.park(centered, hiddenProviderLoadBounds());
              }
              await applyCenterHiddenCommands({
                host: presentationHost,
                previousHidden: next,
                nextHidden: new Set(),
                snapshot,
                shouldContinue: () => centerSurfaceRef.current !== 'native',
              });
            }
          })();
        }
      }
    }

    void applyCenterHiddenCommands({
      host: presentationHost,
      previousHidden: previous,
      nextHidden: next,
      snapshot,
    });

    if (!providerSetEquals(previous, next)) {
      centerHiddenRef.current = next;
      setCenterHidden(next);
    }
  }, [centerSurface, centerTransitionsInFlight, presentation, states, userHidden]);

  useEffect(() => {
    for (const provider of Array.from(centerTransitionsInFlight)) {
      if (presentation[provider] !== 'center' || states[provider].webview === 'loaded') {
        clearCenterTransitionInFlight(provider);
      }
    }
  }, [centerTransitionsInFlight, clearCenterTransitionInFlight, presentation, states]);

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
    const onResize = () => {
      const containerWidth = gridRef.current?.getBoundingClientRect().width ?? window.innerWidth;
      setFocusPaneWidth((current) => clampFocusPaneWidth(current, containerWidth));
      syncAllBounds();
      if (centeredProvider && centerSurfaceRef.current === 'native') void driveCenteredProviderToStage(centeredProvider);
    };
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
      if (centeredProvider && centerSurface === 'native' && centerStageRef.current) {
        const observer = new ResizeObserver(() => {
          void driveCenteredProviderToStage(centeredProvider);
        });
        observer.observe(centerStageRef.current);
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
  }, [centerSurface, centeredProvider, driveCenteredProviderToStage, syncAllBounds, syncBounds]);

  useEffect(() => {
    syncAllBounds();
  }, [focusPaneWidth, presentation, syncAllBounds]);

  useEffect(() => {
    const container = transcriptRef.current;
    if (!container) return;
    const sessionChanged = transcriptSessionRef.current !== activeSessionId;
    const latestMessage = messages[messages.length - 1];
    const userSentMessage =
      latestMessage?.role === 'user' && transcriptLastMessageIdRef.current !== latestMessage.id;
    transcriptSessionRef.current = activeSessionId;
    transcriptLastMessageIdRef.current = latestMessage?.id;
    if (sessionChanged || userSentMessage) transcriptStickToEndRef.current = true;
    if (transcriptStickToEndRef.current) scrollTranscriptToEnd(container);
  }, [activeSessionId, messages]);

  // overlay 關閉後立即把置中的 webview 推回舞台，不等 2.5 秒的定時同步。
  useEffect(() => {
    if (overlayGuardOpen) return;
    if (centeredProvider && centerSurfaceRef.current === 'native') void driveCenteredProviderToStage(centeredProvider);
  }, [overlayGuardOpen, centeredProvider, driveCenteredProviderToStage]);

  const executeSend = async (trimmed: string) => {
    if (!trimmed) return;
    const workflowTargets = mode === 'free' ? freeModeTargets(targets, statesRef.current) : undefined;
    if (workflowTargets?.length === 0) return;
    if (mode === 'free') autoFocusRunCandidate(workflowTargets?.[0]);
    const replayContext =
      replayContextSessionRef.current === activeSessionId ? buildConversationReplayContext(messages) : undefined;
    setMessages((current) => [
      ...current,
      { id: createConversationMessageId('user'), role: 'user', content: trimmed, final: true },
    ]);
    setIsProcessing(processingAfterSend());
    setProcessTrace(createProcessTrace(mode, workflowTargets ?? [], localeRef.current));
    if (pendingProviderResetRef.current.size > 0) {
      const providersToFreshen = [...pendingProviderResetRef.current].filter(
        (provider) => statesRef.current[provider].webview === 'loaded',
      );
      pendingProviderResetRef.current.clear();
      if (providersToFreshen.length > 0) {
        await ensureFreshProviderSessions(providersToFreshen, {
          resetBootState: resetProviderBootState,
          newSession: (provider) =>
            host.provider.newSession(provider).catch((reason) => {
              recordEventLog({
                kind: 'workflow-error',
                provider,
                summary: `${AI_PROVIDERS[provider].name} session restore reset failed`,
                detail: { failure: reason instanceof Error ? reason.message : String(reason) },
              });
            }),
          isDomReady: (provider) => statesRef.current[provider].dom === 'ready',
          wait: () => new Promise((resolve) => setTimeout(resolve, 150)),
        });
      }
    }
    const workflowStartedAt = Date.now();
    const snapshotSettings = settingsRef.current;
    const workflowRoles = defaultRolesForPreset(mode);
    recordEventLog(eventFromWorkflowStart(mode, trimmed.length, workflowTargets?.length));
    const result = await runWorkflow({
      text: trimmed,
      context: replayContext,
      mode,
      roles: workflowRoles,
      targets: workflowTargets,
      snapshotPersistence: snapshotSettings.snapshotPersistence,
      snapshotRedactionTier: snapshotSettings.snapshotRedactionTier,
      responseLanguagePolicy: createResponseLanguagePolicy(snapshotSettings.responseLanguage, localeRef.current),
    });
    const blockedPreflight = preflightFromResult(mode, result);
    if (result.ok) replayContextSessionRef.current = undefined;
    if (blockedPreflight && isSerialMode(mode)) {
      recordEventLog(
        eventFromWorkflowPreflightBlocked(blockedPreflight.mode, blockedPreflight.result.unavailable.length + blockedPreflight.result.aliased.length),
      );
      setPreflight(blockedPreflight);
      setProcessTrace((current) => (current?.steps.length === 0 ? undefined : current));
    }
    recordEventLog(eventFromWorkflowSettled(mode, Date.now() - workflowStartedAt));
    setStepTimeout(undefined);
    setCheckpoint(undefined);
    setCheckpointDraft('');
    activeResponses.current.clear();
    setIsProcessing(processingAfterSettle());
  };

  const send = async (trimmed: string): Promise<boolean> => {
    if (!trimmed) return false;
    if (isSerialMode(mode)) {
      const serialMode = mode as Exclude<ChatMode, 'free'>;
      const roles = defaultRolesForPreset(serialMode);
      try {
        const result = await preflightGraph(workflowGraphs[serialMode], roles);
        if (!result.ok) {
          recordEventLog(eventFromWorkflowPreflightBlocked(serialMode, result.unavailable.length + result.aliased.length));
          setPreflight({ mode: serialMode, result });
          return false;
        }
      } catch {
        setWorkflowStatus(translate('input.sendFailed'));
        return false;
      }
    }

    void executeSend(trimmed);
    return true;
  };

  const dismissStartupSessionCheckpoint = useCallback(() => {
    setSessionCheckpointNotice(undefined);
    void clearStartupSessionCheckpointNotice();
  }, []);

  const replayStartupSessionCheckpoint = useCallback(() => {
    if (!sessionCheckpointNotice?.replaySnapshot) return;
    const source: ReplaySource = {
      kind: 'stored',
      snapshotId: sessionCheckpointNotice.replaySnapshot.id,
      info: sessionCheckpointNotice.replaySnapshot,
    };
    setReplayDrawerOpen(true);
    setSessionCheckpointReplayBusy(true);
    const replay = replayPanelRef.current?.startReplay(source);
    if (replay) {
      void replay.finally(() => setSessionCheckpointReplayBusy(false));
    } else {
      setSessionCheckpointReplayBusy(false);
    }
  }, [sessionCheckpointNotice]);

  const cancelWorkflow = () => {
    publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });
    setManualFocusLock(undefined);
    setIsProcessing(false);
    setWorkflowStatus('');
    setStepTimeout(undefined);
    setCheckpoint(undefined);
    setCheckpointDraft('');
    activeResponses.current.clear();
    setProcessTrace((current) => (current ? settleProcessTrace(current) : current));
  };

  const startNewConversation = useCallback(() => {
    if (isProcessing) return;
    const now = Date.now();
    const nextSession = createConversationSession({ now });
    setSessions((current) => {
      const existing = current.find((session) => session.id === activeSessionId);
      const storedMessages = conversationMessages(messages);
      const archived = existing && sessionContentChanged(existing, storedMessages, mode)
        ? upsertConversationSession(current, {
            ...existing,
            title: titleFromFirstUserMessage(storedMessages),
            updatedAt: now,
            mode,
            messages: storedMessages,
          })
        : current;
      const next = upsertConversationSession(archived, nextSession);
      return persistConversationSessions(next);
    });
    setActiveSessionId(nextSession.id);
    replayContextSessionRef.current = undefined;
    setMessages([]);
    setMode('free');
    setPresetDetailsMode(undefined);
    setWorkflowStatus('');
    setProcessTrace(undefined);
    setReplayDrawerOpen(false);
    setTargetSelection({ targets: [...DEFAULT_FREE_TARGET_PROVIDERS], defaultsInitialized: true, userTouched: false });
    activeResponses.current.clear();
    pendingProviderResetRef.current.clear();
    for (const provider of PROVIDERS) {
      if (statesRef.current[provider].webview !== 'loaded') continue;
      resetProviderBootState(provider);
      void host.provider.newSession(provider).catch((reason) => {
        recordEventLog({
          kind: 'workflow-error',
          provider,
          summary: `${AI_PROVIDERS[provider].name} new session failed`,
          detail: { failure: reason instanceof Error ? reason.message : String(reason) },
        });
      });
    }
  }, [activeSessionId, isProcessing, messages, mode]);

  const selectConversationSession = useCallback(
    (session: ConversationSession) => {
      if (isProcessing || session.id === activeSessionId) return;
      setActiveSessionId(session.id);
      replayContextSessionRef.current = session.messages.length > 0 ? session.id : undefined;
      setMessages(bubblesFromSession(session));
      setMode(session.mode);
      setPresetDetailsMode(undefined);
      setWorkflowStatus('');
      setProcessTrace(undefined);
      setReplayDrawerOpen(false);
      setTargetSelection({ targets: [...DEFAULT_FREE_TARGET_PROVIDERS], defaultsInitialized: true, userTouched: false });
      activeResponses.current.clear();
      // 切換歷史只換本地畫面，保留 provider webview 原連線（不重連）讓使用者能繼續瀏覽；
      // 遠端 thread 仍屬於前一個 session，真正送出前 executeSend 會先建立乾淨 provider session。
      pendingProviderResetRef.current = new Set(PROVIDERS.filter((provider) => statesRef.current[provider].webview === 'loaded'));
    },
    [activeSessionId, isProcessing],
  );

  const deleteConversationSession = useCallback(
    (session: ConversationSession) => {
      if (isProcessing) return;
      const remaining = removeConversationSession(sessions, session.id);
      if (session.id !== activeSessionId) {
        setSessions(persistConversationSessions(remaining));
        return;
      }

      const nextActive = remaining[0] ?? createConversationSession();
      const next = upsertConversationSession(remaining, nextActive);
      setSessions(persistConversationSessions(next));
      selectConversationSession(nextActive);
    },
    [activeSessionId, isProcessing, selectConversationSession, sessions],
  );

  const exportConversation = async () => {
    if (messages.length === 0 || sharing) return;
    setSharing(true);
    try {
      const now = new Date();
      const appVersion = await getRuntimeAppVersion();
      const snapshot = matchingSnapshotForConversation(messages, getLastSnapshot());
      const { content } = buildMarkdown(messages, mode, now, { appVersion, snapshot });
      const saved = await host.share.exportMarkdown(exportFilename(mode, now), content);
      if (saved) setShareNotice({ kind: 'ok', text: formatI18n(translateKey('share.exported', localeRef.current), { path: saved }) });
    } catch (reason) {
      recordEventLog({
        ts: Date.now(),
        kind: 'workflow-error',
        summary: translateKey('share.exportFailed', localeRef.current),
        detail: { operation: 'export', error: reason instanceof Error ? reason.message : String(reason) },
      });
      setShareNotice({ kind: 'error', text: translateKey('share.exportFailed', localeRef.current) });
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

  const dragFocusPane = (deltaX: number, phase: 'start' | 'move' | 'end') => {
    if (phase === 'start') {
      dragStartFocusPaneWidth.current = focusPaneWidth;
      return;
    }
    const containerWidth = gridRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const maxWidth = Math.max(
      DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.minFocusPaneWidth,
      containerWidth - DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.minCenterWidth - DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.resizerWidth,
    );
    const nextWidth = dragFocusPaneWidth(
      dragStartFocusPaneWidth.current,
      deltaX,
      DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.minFocusPaneWidth,
      maxWidth,
    );
    setFocusPaneWidth(nextWidth);
    if (phase === 'end') void persistSettingsPatch({ focusPaneWidth: nextWidth });
  };

  const enlargeCenter = useCallback(() => {
    const provider = centerPresentationProvider(presentationRef.current);
    setCenterSurfaceMode('native');
    if (provider) void changeProviderPresentationRef.current(provider, 'center');
  }, [setCenterSurfaceMode]);

  const collapseCenter = useCallback(() => {
    const provider = centerPresentationProvider(presentationRef.current);
    forcedNativeCenterProviderRef.current = undefined;
    if (provider) {
      beginPresentationTransition(provider);
      clearCenterTransitionInFlight(provider);
    }
    setCenterSurfaceMode('text');
    if (provider && statesRef.current[provider].webview === 'loaded') {
      void host.provider.park(provider, hiddenProviderLoadBounds());
    }
  }, [beginPresentationTransition, clearCenterTransitionInFlight, setCenterSurfaceMode]);

  const openProviderLogin = useCallback(
    async (provider: AIProvider) => {
      if (centerPresentationProvider(presentationRef.current) === provider && centerSurfaceRef.current === 'text') {
        setCenterSurfaceMode('native');
        clearUserHiddenProvider(provider);
      }
      await host.provider.openLogin(provider);
    },
    [clearUserHiddenProvider, setCenterSurfaceMode],
  );

  const openPreflightLogin = useCallback(
    async (provider: AIProvider) => {
      setPreflight(undefined);
      try {
        await forceProviderNativeCenter(provider);
        await openProviderLogin(provider);
      } catch {
        setWorkflowStatus(translate('input.sendFailed'));
      }
    },
    [forceProviderNativeCenter, openProviderLogin, translate],
  );

  const applySavedSettings = (settings: AppSettings) => {
    settingsRef.current = settings;
    presentationRef.current = settings.presentation;
    setAppSettings(settings);
    setLanguage(settings.language);
    setFocusPaneWidth(settings.focusPaneWidth);
    setPresentation(settings.presentation);
  };

  const selectPreset = useCallback(
    (nextMode: ChatMode) => {
      if (isProcessing) return;
      setMode(nextMode);
      setPresetDetailsMode((current) => (current === nextMode ? undefined : nextMode));
    },
    [isProcessing],
  );

  const persistReplaySnapshot = useCallback((snapshot: ExecutionSnapshot) => {
    const snapshotSettings = settingsRef.current;
    return persistSnapshotIfEnabled(snapshot, {
      enabled: snapshotSettings.snapshotPersistence,
      tier: snapshotSettings.snapshotRedactionTier,
    });
  }, []);

  const prepareReplayTrace = useCallback((plan: ReplayPlan) => {
    const replayMode = modeFromReplayPlan(plan);
    if (!replayMode) return;
    const replayTargets = replayMode === 'free' ? plan.targets ?? [] : [];
    setProcessTrace(createProcessTrace(replayMode, replayTargets, localeRef.current));
    setIsProcessing(processingAfterSend());
    recordEventLog(eventFromWorkflowStart(replayMode, plan.question?.length ?? 0, replayTargets.length || undefined));
  }, []);

  const settleReplayTrace = useCallback(() => {
    setManualFocusLock(undefined);
    setStepTimeout(undefined);
    setIsProcessing(processingAfterSettle());
  }, [setManualFocusLock]);

  const layoutWidth = gridRef.current?.getBoundingClientRect().width ?? (typeof window === 'undefined' ? 1280 : window.innerWidth);
  const focusPaneMaxWidth = Math.max(
    DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.minFocusPaneWidth,
    layoutWidth - DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.minCenterWidth - DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.resizerWidth,
  );
  const modeBlockedMessage = modeSendBlocked
    ? formatI18n(translate('input.modeNotReady'), { remaining: missingModeProviderCount })
    : undefined;

  return (
    <main className="app-shell h-screen overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div ref={gridRef} className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)]" style={{ gridTemplateColumns: focusGridTemplateColumns(focusPaneWidth) }}>
        <div className="ai-sister-left-shell flex min-h-0 min-w-0 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <ConversationSidebar
            collapsed={sessionSidebarCollapsed}
            sessions={sessions}
            activeSessionId={activeSessionId}
            disabled={isProcessing}
            locale={locale}
            labels={{
              toggle: translate('conversation.toggle'),
              newConversation: translate('conversation.new'),
              history: translate('conversation.history'),
              empty: translate('conversation.empty'),
              deleteConversation: translate('conversation.delete'),
              confirmDeleteConversation: translate('conversation.deleteConfirm'),
            }}
            onToggle={() => setSessionSidebarCollapsed((current) => !current)}
            onNewConversation={startNewConversation}
            onSelectSession={selectConversationSession}
            onDeleteSession={deleteConversationSession}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <section
              id="workflow-control-shelf"
              aria-label={translate('preset.catalog.aria')}
              className="ai-sister-workflow-shelf max-h-[42vh] shrink-0 overflow-auto border-b border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <AiSisterEnsembleCard />
              <PresetCatalog
                mode={mode}
                onSelectPreset={selectPreset}
                locale={locale}
                states={states}
                disabled={isProcessing}
                detailsMode={presetDetailsMode}
                layout="sidebar"
              />
              {mode === 'free' ? (
                <section className="mt-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="mb-2 text-xs font-semibold uppercase text-zinc-600 dark:text-zinc-400">{translate('input.sendSelectedProviders')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <TargetChips providers={PROVIDERS} states={states} selected={targets} onChange={handleTargetsChange} disabled={isProcessing} locale={locale} />
                  </div>
                </section>
              ) : null}
              {checkpoint ? (
                <details className="mt-2 border border-amber-300 bg-white dark:border-amber-900 dark:bg-zinc-950" open>
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-950">
                    {translate('checkpoint.confirmEachStep')}
                  </summary>
                  <div className="border-t border-amber-300 px-3 pb-3 dark:border-amber-900">
                    <CheckpointCard
                      checkpoint={checkpoint}
                      draft={checkpointDraft}
                      onDraftChange={setCheckpointDraft}
                      onNativeEdit={(provider) => {
                        void forceProviderNativeCenter(provider);
                      }}
                      locale={locale}
                    />
                  </div>
                </details>
              ) : null}
              {stepTimeout && !stepTimeout.timedOut ? (
                <StepTimeoutDialog event={stepTimeout} onClose={() => setStepTimeout(undefined)} locale={locale} />
              ) : null}
            </section>
            <FocusPane
              centeredProvider={centeredProvider}
              states={states}
              presentation={presentation}
              centerSurface={centerSurface}
              centerText={centerText}
              centerTextFinal={centerTextFinal}
              userHidden={userHidden}
              presentationHidden={presentationHidden}
              setPaneRef={setPaneRef}
              setCenterStageRef={setCenterStageRef}
              changeProviderPresentation={changeProviderPresentationManually}
              onManualFocusControl={markManualFocusControl}
              onEnlargeCenter={enlargeCenter}
              onCollapseCenter={collapseCenter}
              onOpenLogin={openProviderLogin}
              syncBounds={syncBounds}
              reportProvider={reportProvider}
              reportBusy={reportBusy}
              processTrace={processTrace}
              onTraceDetailOpenChange={setProcessTraceDetailOpen}
              onChipClick={(provider) => {
                const container = transcriptRef.current;
                if (container) scrollTranscriptToProviderMessage(container, provider);
              }}
            />
          </div>
        </div>

        <Resizer
          label={translate('layout.resizeFocusPane')}
          onDrag={dragFocusPane}
          value={focusPaneWidth}
          min={DEFAULT_FOCUS_LAYOUT_CONSTRAINTS.minFocusPaneWidth}
          max={focusPaneMaxWidth}
        />

        <section className="ai-sister-conversation-workspace flex min-h-0 min-w-0 flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
          <div className="ai-sister-conversation-toolbar border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ai-sister-mode-badge shrink-0 border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 px-2 py-1 text-xs font-medium text-sky-700 dark:text-sky-100">
                    <span className="mr-1">{CHAT_MODES[mode].icon}</span>
                    {translate(MODE_NAME_KEYS[mode])}
                  </span>
                  <span className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400">{workflowStatus || translate('processTrace.settled')}</span>
                </div>
              </div>
              <button
                type="button"
                className={`flex h-7 items-center justify-center gap-1.5 border px-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  replayDrawerOpen ? 'border-sky-400 bg-sky-50 dark:border-sky-800 dark:bg-sky-950' : 'border-zinc-300 dark:border-zinc-700'
                }`}
                aria-label={translate('replay.historyToggle')}
                title={translate('replay.historyToggle')}
                aria-expanded={replayDrawerOpen}
                aria-controls="replay-history-panel"
                onClick={() => setReplayDrawerOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>{translate('replay.historyToggle')}</span>
              </button>
              <button
                type="button"
                className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void exportConversation()}
                disabled={messages.length === 0 || sharing}
              >
                {translate('header.exportMarkdown')}
              </button>
              <button type="button" className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setSettingsOpen(true)}>
                {translate('header.settings')}
              </button>
            </div>
          </div>
          <div
            id="replay-history-panel"
            hidden={!replayDrawerOpen}
            className="mt-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 pb-3"
          >
            <ReplayPanel
              ref={replayPanelRef}
              locale={locale}
              responseLanguagePolicy={createResponseLanguagePolicy(appSettings.responseLanguage, locale)}
              onReplayWillRun={prepareReplayTrace}
              onReplaySettled={settleReplayTrace}
              onSnapshotComplete={persistReplaySnapshot}
            />
          </div>
          {sessionCheckpointNotice ? (
            <SessionCheckpointNotice
              notice={sessionCheckpointNotice}
              replaying={sessionCheckpointReplayBusy}
              onDismiss={dismissStartupSessionCheckpoint}
              onReplay={sessionCheckpointNotice.replaySnapshot ? replayStartupSessionCheckpoint : undefined}
              locale={locale}
            />
          ) : null}
          {shareNotice ? (
            <div
              role={shareNotice.kind === 'error' ? 'alert' : 'status'}
              className={
                shareNotice.kind === 'error'
                  ? 'mt-3 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-800 dark:text-red-200'
                  : 'mt-3 border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200'
              }
            >
              {shareNotice.text}
            </div>
          ) : null}
          {adapterNotice ? (
            <div role={adapterNotice.kind.endsWith('failed') ? 'alert' : 'status'} className={`mt-3 border px-3 py-2 text-xs ${adapterNoticeClass(adapterNotice.kind)}`}>
              {adapterNoticeText(adapterNotice)}
            </div>
          ) : null}
          <div
            ref={transcriptRef}
            className="ai-sister-conversation-transcript mt-3 min-h-0 flex-1 overflow-auto border-y border-zinc-200 dark:border-zinc-800 py-3"
            onScroll={(event) => {
              transcriptStickToEndRef.current = isTranscriptNearEnd(event.currentTarget);
            }}
          >
            <ChatArea messages={messages} locale={locale} states={states} />
            {import.meta.env.DEV ? <EchoPanel /> : null}
          </div>
          <div className="ai-sister-conversation-composer shrink-0 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <InputBar
              onSend={send}
              onCancel={cancelWorkflow}
              disabled={noSendableProviders}
              sendBlocked={modeSendBlocked}
              blockedMessage={modeBlockedMessage}
              isProcessing={isProcessing}
              locale={locale}
            />
          </div>
        </section>
      </div>
      {preflight ? (
        <PreflightDialog
          model={buildPreflightDialogModel(preflight.mode, preflight.result, states, locale)}
          onOpenLogin={(provider) => void openPreflightLogin(provider)}
          onClose={() => setPreflight(undefined)}
          onSwitchMode={() => {
            setMode('free');
            setPreflight(undefined);
          }}
          locale={locale}
        />
      ) : null}
      {stepTimeout?.timedOut ? <StepTimeoutDialog event={stepTimeout} onClose={() => setStepTimeout(undefined)} locale={locale} /> : null}
      <SettingsModal
        open={settingsOpen}
        openProviders={openProviders}
        focusPaneWidth={focusPaneWidth}
        presentation={presentation}
        providerStates={states}
        onClose={() => setSettingsOpen(false)}
        onSaved={applySavedSettings}
      />
      {reportPreview ? (
        <ReportPreviewDialog
          preview={reportPreview}
          busy={reportBusy}
          onOpenIssue={() => void openReportIssue()}
          onCancel={() => setReportPreview(null)}
          locale={locale}
        />
      ) : null}
    </main>
  );
}

function ReportPreviewDialog({
  preview,
  busy,
  onOpenIssue,
  onCancel,
  locale,
}: {
  preview: { provider: AIProvider; digest: ReportDigest; body: string };
  busy: boolean;
  onOpenIssue: () => void;
  onCancel: () => void;
  locale: Locale;
}) {
  const digest = preview.digest;
  return (
    <ModalDialog
      titleId="report-preview-title"
      onEscape={onCancel}
      onBackdrop={onCancel}
      panelClassName="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-zinc-300 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
    >
        <div className="mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <h2 id="report-preview-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{translateKey('reportPreview.title', locale)}</h2>
        </div>
        <div className="grid gap-2 text-xs text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
          <div>
            {translateKey('reportPreview.provider', locale)}: {digest.displayName} ({digest.provider})
          </div>
          <div>
            {translateKey('reportPreview.adapterVersion', locale)}: {digest.adapterVersion}
          </div>
          <div>
            {translateKey('reportPreview.appVersion', locale)}: {digest.appVersion}
          </div>
          <div>
            {translateKey('reportPreview.path', locale)}: {digest.path}
          </div>
          <div className="sm:col-span-2">
            {translateKey('reportPreview.firstMissingField', locale)}: {digest.firstMissingField ?? translateKey('reportPreview.none', locale)}
          </div>
        </div>
        {!digest.firstMissingField ? (
          <div className="mt-4 border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
            {translateKey('reportPreview.noStructuralFailure', locale)}
          </div>
        ) : null}
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
          {preview.body}
        </pre>
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <button type="button" className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={onCancel}>
            {translateKey('reportPreview.cancel', locale)}
          </button>
          <button
            type="button"
            className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950 px-3 py-1.5 text-sm text-emerald-700 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onOpenIssue}
            disabled={busy || !digest.firstMissingField}
          >
            {translateKey('reportPreview.openGithubIssue', locale)}
          </button>
        </div>
    </ModalDialog>
  );
}

function adapterNoticeClass(kind: string): string {
  if (kind === 'updated' || kind === 'downgraded') return 'border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200';
  if (kind === 'report-failed') return 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200';
  if (kind.endsWith('-failed')) return 'border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200';
  return 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200';
}

function adapterNoticeText(notice: AdapterNotice): string {
  const provider = notice.provider in AI_PROVIDERS ? AI_PROVIDERS[notice.provider as AIProvider].name : notice.provider;
  if (notice.kind === 'updated' || notice.kind === 'downgraded') {
    const version = notice.version != null ? ` to v${notice.version}` : '';
    return `${provider} adapter ${notice.kind}${version}.`;
  }
  return `${provider}: ${notice.message || notice.kind}`;
}

export function ChatArea({
  messages,
  locale,
  states,
}: {
  messages: Bubble[];
  locale: Locale;
  states: Record<AIProvider, ProviderState>;
}) {
  if (messages.length === 0) {
    const anyReady = (Object.keys(states) as AIProvider[]).some((provider) => isSendable(states[provider]));
    return (
      <div className="grid min-h-32 place-items-center p-6 text-center" role="status">
        <div>
          <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{translateKey('chat.noMessages', locale)}</div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {translateKey(anyReady ? 'chat.readyPrompt' : 'chat.noProviders', locale)}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-2">
      {messages.map((message) => {
        const p = message.provider;
        const isProvider = typeof p === 'string' && p in AI_PROVIDERS;
        const thinking = isProvider && !message.final && states[p as AIProvider]?.thinking === true;
        const statusLabel =
          message.role === 'ai' && !message.final ? translateKey(thinking ? 'chat.thinking' : 'chat.streaming', locale) : '';

        return (
          <article
            key={message.id}
            className="ai-sister-message border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3"
            data-provider={isProvider ? p : undefined}
          >
            <div className="mb-1 flex items-center gap-2">
              {isProvider ? <AiSisterAvatar provider={p as AIProvider} active={thinking} size="md" /> : null}
              <div className="text-xs uppercase text-zinc-500 dark:text-zinc-500">
                {bubbleAuthorLabel(message)}
                {message.modeRole ? ` · ${message.modeRole}` : ''}
                {statusLabel ? ` ${statusLabel}` : ''}
              </div>
            </div>
            {thinking ? (
              <div className="whitespace-pre-wrap text-sm italic text-zinc-500 dark:text-zinc-500">{translateKey('chat.thinking', locale)}</div>
            ) : (
              <div className="text-sm">
                <MarkdownText text={message.content} />
              </div>
            )}
            {message.truncated ? <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">{translateKey('chat.truncated', locale)}</div> : null}
          </article>
        );
      })}
    </div>
  );
}

function modeFromReplayPlan(plan: ReplayPlan): ChatMode | undefined {
  const candidate = plan.graph?.mode ?? plan.graph?.id;
  return typeof candidate === 'string' && candidate in CHAT_MODES ? (candidate as ChatMode) : undefined;
}
