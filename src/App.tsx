import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AI_PROVIDERS, CHAT_MODES, DEFAULT_FREE_TARGET_PROVIDERS } from '../shared/constants';
import type { AIProvider, BridgeMessage, ChatMode, ModeRoles, ProviderState } from '../shared/types';
import { startBridgePull, resetProviderBootState } from './bridge/pull';
import { isRenderableResponseMessage } from './bridge/render';
import { publishBridgeMessage } from './bridge/bus';
import { EchoPanel } from './dev/EchoPanel';
import { host } from './host';
import { mergePullBridgeState, type PullBridgeState } from './appBridgeState';
import { onCheckpoint, type PendingCheckpoint } from './workflow/checkpoint';
import { isSendable, onStepTimeoutEvent, runWorkflow } from './workflow';
import type { PreflightResult } from './workflow/preflight';
import { bubbleAuthorLabel } from './bubbleAuthorLabel';
import { CheckpointCard } from './ui/CheckpointCard';
import { InputBar } from './ui/InputBar';
import { makeFileDragGuard } from './ui/fileDrop';
import { ModeSelector } from './ui/ModeSelector';
import { PreflightDialog } from './ui/PreflightDialog';
import { PresetCatalog } from './ui/PresetCatalog';
import { ProcessTrace } from './ui/ProcessTrace';
import { createProcessTrace, reduceProcessTraceEvent, settleProcessTrace, type ProcessTraceState } from './ui/processTraceModel';
import { ReplayPanel, type ReplaySource } from './ui/ReplayPanel';
import { RoleConfig } from './ui/RoleConfig';
import { SessionCheckpointNotice } from './ui/SessionCheckpointNotice';
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
import {
  centerHiddenProviders,
  centerPresentationProvider,
  chipProviders,
  defaultPresentation,
  restorableOpenProviders,
  setProviderPresentation,
  sideProviders,
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
import { defaultRolesForPreset } from './ui/presetCatalogData';
import { buildPreflightDialogModel } from './ui/preflightModel';
import { preflightFromResult } from './ui/preflightFromResult';
import { processingAfterSend, processingAfterSettle, processingAfterWorkflowStatus } from './ui/processing';
import { Resizer } from './ui/Resizer';
import { SettingsModal } from './ui/SettingsModal';
import { defaultSettings, mergeSettings, normalizeSettings, slotProviders, type AppSettings } from './ui/settingsModel';
import {
  clearStartupSessionCheckpointNotice,
  loadStartupSessionCheckpointNotice,
  type StartupSessionCheckpointNotice,
} from './ui/sessionCheckpointStartup';
import { DEFAULT_SLOT_ASSIGNMENT, type SlotAssignment } from './ui/slotAssignment';
import { nextStepTimeoutState } from './ui/stepTimeoutState';
import {
  applyFreeTargetDefaults,
  defaultTargets,
  freeModeTargets,
  hasEffectiveFreeModeTargets,
  markFreeTargetsTouched,
  type FreeTargetSelection,
} from './ui/targets';
import { useOverlayGuard } from './ui/useOverlayGuard';
import { visibleLoadedProviders } from './ui/visibility';
import { buildMarkdown, exportFilename } from './ui/exportMarkdown';
import { formatReportBody, type AdapterNotice, type ReportDigest } from './ui/reportBroken';
import { persistSnapshotIfEnabled } from './workflow/snapshot/persistence';
import type { ReplayPlan } from './workflow/snapshot/replay';
import type { ExecutionSnapshot } from './workflow/snapshot/types';
import {
  eventFromAdapterNotice,
  eventFromBridgeMessage,
  eventFromProviderState,
  eventFromStepTimeout,
  eventFromWorkflowPreflightBlocked,
  eventFromWorkflowSettled,
  eventFromWorkflowStart,
} from './diagnostics/eventLog';
import { recordEventLog } from './diagnostics/eventLogStore';

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

const presentationHost: PresentationCommandHost = {
  close: host.provider.close,
  hide: host.provider.hide,
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
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(false);
  const [processTrace, setProcessTrace] = useState<ProcessTraceState | undefined>();
  const [targetSelection, setTargetSelection] = useState<FreeTargetSelection>(() => ({
    targets: [],
    defaultsInitialized: false,
    userTouched: false,
  }));
  const [confirmEachStep, setConfirmEachStep] = useState(false);
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
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [slotAssignment, setSlotAssignment] = useState<SlotAssignment>(() => ({ ...DEFAULT_SLOT_ASSIGNMENT }));
  const [presentation, setPresentation] = useState<PresentationByProvider>(() => defaultPresentation());
  const [userHidden, setUserHidden] = useState<Set<AIProvider>>(() => new Set());
  const [centerHidden, setCenterHidden] = useState<Set<AIProvider>>(() => new Set());
  const [centerTransitionsInFlight, setCenterTransitionsInFlight] = useState<Set<AIProvider>>(() => new Set());
  const [accessProvider, setAccessProvider] = useState<AIProvider | null>(null);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const centerStageRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const statesRef = useRef(states);
  const userHiddenRef = useRef<Set<AIProvider>>(userHidden);
  const settingsRef = useRef<AppSettings>(appSettings);
  const presentationRef = useRef<PresentationByProvider>(presentation);
  const centerHiddenRef = useRef<Set<AIProvider>>(centerHidden);
  const centerTransitionsInFlightRef = useRef<Set<AIProvider>>(centerTransitionsInFlight);
  const centerTransitionGenerations = useRef<Map<AIProvider, number>>(new Map());
  const presentationTransitionGenerations = useRef<Record<AIProvider, number>>(
    Object.fromEntries(PROVIDERS.map((provider) => [provider, 0])) as Record<AIProvider, number>,
  );
  const overlayGuardOpenRef = useRef(false);
  const pendingRestore = useRef<Set<AIProvider>>(new Set());
  const dragStartWidths = useRef<ColumnWidths>({ ...DEFAULT_COLUMN_WIDTHS });
  const turnRef = useRef(0);
  const activeTurns = useRef(new Map<AIProvider, { turn: number; label?: string }>());
  const pullBridge = useRef(new Map<AIProvider, PullBridgeState>());
  const replayPanelRef = useRef<ReplayPanel | null>(null);
  const targets = targetSelection.targets;
  const effectiveHidden = useMemo(() => new Set<AIProvider>([...userHidden, ...centerHidden]), [centerHidden, userHidden]);
  const loadedModalProviders = useMemo(() => visibleLoadedProviders(states, effectiveHidden, PROVIDERS), [effectiveHidden, states]);
  const defaultSendableTargets = useMemo(() => defaultTargets(states, [...DEFAULT_FREE_TARGET_PROVIDERS]), [states]);
  const hasFreeModeTargets = useMemo(() => hasEffectiveFreeModeTargets(targets, states), [states, targets]);
  const anySendableTargets = useMemo(() => defaultTargets(states, PROVIDERS), [states]);
  const noSendableProviders = mode === 'free' ? !hasFreeModeTargets : anySendableTargets.length === 0;
  const openProviders = useMemo(() => PROVIDERS.filter((provider) => states[provider].webview === 'loaded'), [states]);
  const centeredProvider = useMemo(() => centerPresentationProvider(presentation), [presentation]);
  const chipRailProviders = useMemo(() => chipProviders(presentation, PROVIDERS), [presentation]);
  const leftProviders = useMemo(() => sideProviders(presentation, slotProviders(slotAssignment, 'left')), [presentation, slotAssignment]);
  const rightProviders = useMemo(() => sideProviders(presentation, slotProviders(slotAssignment, 'right')), [presentation, slotAssignment]);

  const overlayGuardOpen =
    Boolean(preflight) || Boolean(stepTimeout?.timedOut) || settingsOpen || Boolean(reportPreview) || Boolean(accessProvider);
  overlayGuardOpenRef.current = overlayGuardOpen;
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
        setPresentation(loaded.presentation);
        pendingRestore.current = new Set(restorableOpenProviders(loaded.openProviders, loaded.presentation));
        setInitialRestoreComplete(pendingRestore.current.size === 0);
      })
      .catch(() => {
        if (disposed) return;
        const defaults = defaultSettings();
        settingsRef.current = defaults;
        setAppSettings(defaults);
        setPresentation(defaults.presentation);
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
        setProcessTrace((current) => (current ? reduceProcessTraceEvent(current, message) : current));
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
        setProcessTrace((current) => (current ? reduceProcessTraceEvent(current, message) : current));
        return;
      }
      if (!isRenderableResponseMessage(message) || !message.provider) return;
      setProcessTrace((current) => (current ? reduceProcessTraceEvent(current, message) : current));
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
  }, []);

  useEffect(() => {
    if (mode === 'free') return;
    setRoles(defaultRolesForMode(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'free') return;
    setTargetSelection((current) => applyFreeTargetDefaults(current, defaultSendableTargets));
  }, [defaultSendableTargets, mode]);

  const handleTargetsChange = useCallback((nextTargets: AIProvider[]) => {
    setTargetSelection((current) => markFreeTargetsTouched(current, nextTargets));
  }, []);

  const boundsForProvider = useCallback((provider: AIProvider): DOMRectReadOnly | undefined => {
    if (presentationRef.current[provider] === 'center') {
      return centerStageRef.current?.getBoundingClientRect() ?? paneRefs.current[provider]?.getBoundingClientRect();
    }
    return paneRefs.current[provider]?.getBoundingClientRect();
  }, []);

  const fallbackBoundsForProvider = useCallback(
    (provider: AIProvider): DOMRectReadOnly => boundsForProvider(provider) ?? new DOMRect(24, 24, 420, 320),
    [boundsForProvider],
  );

  const boundsForPresentationTarget = useCallback((provider: AIProvider, state: WebviewPresentationState): DOMRectReadOnly | undefined => {
    if (state === 'center') return centerStageRef.current?.getBoundingClientRect();
    if (state === 'side') return paneRefs.current[provider]?.getBoundingClientRect();
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
        shouldContinue: () => presentationTransitionCurrent(provider, state, generation),
      }),
    [boundsForPresentationTarget, presentationTransitionCurrent],
  );

  const openProvider = useCallback(async (provider: AIProvider) => {
    const rect = fallbackBoundsForProvider(provider);
    resetProviderBootState(provider);
    await host.provider.open(provider, rect);
  }, [fallbackBoundsForProvider]);

  const syncBounds = useCallback(async (provider: AIProvider) => {
    if (presentationRef.current[provider] === 'chip') return;
    const rect = boundsForProvider(provider);
    if (!rect || statesRef.current[provider].webview !== 'loaded') return;
    await host.layout.setBounds(provider, rect);
  }, [boundsForProvider]);

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

  const setCenterStageRef = useCallback(
    (el: HTMLDivElement | null) => {
      centerStageRef.current = el;
      if (!el) return;
      const provider = centerPresentationProvider(presentationRef.current);
      if (!provider) return;
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
      void openProvider(provider).finally(() => {
        if (pendingRestore.current.size === 0) setInitialRestoreComplete(true);
      });
    }

    if (pendingRestore.current.size === 0) setInitialRestoreComplete(true);
  }, [centeredProvider, initialRestoreComplete, leftProviders, openProvider, presentation, rightProviders, settingsLoaded]);

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

      await applyCenterHiddenCommands({
        host: presentationHost,
        previousHidden: previous,
        nextHidden: next,
        snapshot: () => ({
          states: statesRef.current,
          presentation: presentationRef.current,
          userHidden: userHiddenRef.current,
          overlayGuardOpen: overlayGuardOpenRef.current,
        }),
        shouldContinue: () => presentationTransitionCurrent(provider, 'center', generation),
        restoreRemoved: false,
      });

      if (presentationTransitionCurrent(provider, 'center', generation) && !providerSetEquals(previous, next)) {
        centerHiddenRef.current = next;
        setCenterHidden(next);
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

      const bounds = await waitForProviderPresentationBounds(provider, state, generation);
      if (!bounds) {
        if (state === 'center') clearCenterTransitionInFlight(provider, generation);
        return;
      }

      if (state === 'center') await hideCenterSiblingsForTransition(provider, generation);
      if (!presentationTransitionCurrent(provider, state, generation)) return;

      try {
        if (statesRef.current[provider].webview !== 'loaded') resetProviderBootState(provider);
        await applyPresentationTransitionCommand({
          host: presentationHost,
          provider,
          state,
          bounds,
          webview: statesRef.current[provider].webview,
          currentWebview: () => statesRef.current[provider].webview,
          shouldContinue: () => presentationTransitionCurrent(provider, state, generation),
        });
      } catch (error) {
        if (state === 'center') clearCenterTransitionInFlight(provider, generation);
        throw error;
      }
    },
    [
      beginPresentationTransition,
      clearCenterTransitionInFlight,
      clearUserHiddenProvider,
      hideCenterSiblingsForTransition,
      persistPresentation,
      presentationTransitionCurrent,
      startCenterTransitionInFlight,
      waitForProviderPresentationBounds,
    ],
  );

  useEffect(() => {
    const next = new Set(centerHiddenProviders(presentation, states, userHidden, PROVIDERS, centerTransitionsInFlight));
    const previous = centerHiddenRef.current;
    const centered = centerPresentationProvider(presentation);

    if (centered && states[centered].webview === 'loaded') {
      const bounds = centerStageRef.current?.getBoundingClientRect();
      if (bounds) {
        void applyCenterStageCommand({
          host: presentationHost,
          provider: centered,
          bounds,
          overlappingProviders: Array.from(next),
          currentWebview: (candidate) => statesRef.current[candidate].webview,
          shouldContinue: () => presentationRef.current[centered] === 'center',
        });
      }
    }

    void applyCenterHiddenCommands({
      host: presentationHost,
      previousHidden: previous,
      nextHidden: next,
      snapshot: () => ({
        states: statesRef.current,
        presentation: presentationRef.current,
        userHidden: userHiddenRef.current,
        overlayGuardOpen: overlayGuardOpenRef.current,
      }),
    });

    if (!providerSetEquals(previous, next)) {
      centerHiddenRef.current = next;
      setCenterHidden(next);
    }
  }, [centerTransitionsInFlight, presentation, states, userHidden]);

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
      if (centeredProvider && centerStageRef.current) {
        const observer = new ResizeObserver(() => {
          void syncBounds(centeredProvider);
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
  }, [centeredProvider, leftProviders, rightProviders, syncAllBounds, syncBounds]);

  useEffect(() => {
    syncAllBounds();
  }, [columnWidths, presentation, syncAllBounds]);

  const send = async (trimmed: string) => {
    if (!trimmed) return;
    const workflowTargets = mode === 'free' ? freeModeTargets(targets, statesRef.current) : undefined;
    if (workflowTargets?.length === 0) return;
    const turnId = ++turnRef.current;
    setMessages((current) => [...current, { id: `user-${turnId}`, role: 'user', content: trimmed, final: true }]);
    setIsProcessing(processingAfterSend());
    setProcessTrace(createProcessTrace(mode, workflowTargets ?? []));
    const workflowStartedAt = Date.now();
    const snapshotSettings = settingsRef.current;
    recordEventLog(eventFromWorkflowStart(mode, trimmed.length, workflowTargets?.length));
    const result = await runWorkflow({
      text: trimmed,
      mode,
      roles: mode === 'free' ? undefined : roles,
      targets: workflowTargets,
      checkpoints: confirmEachStep,
      snapshotPersistence: snapshotSettings.snapshotPersistence,
      snapshotRedactionTier: snapshotSettings.snapshotRedactionTier,
    });
    const blockedPreflight = preflightFromResult(mode, result);
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
    activeTurns.current.clear();
    setIsProcessing(processingAfterSettle());
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
    setAdvancedControlsOpen(true);
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
    setIsProcessing(false);
    setWorkflowStatus('');
    setStepTimeout(undefined);
    setCheckpoint(undefined);
    setCheckpointDraft('');
    activeTurns.current.clear();
    setProcessTrace((current) => (current ? settleProcessTrace(current) : current));
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
    presentationRef.current = settings.presentation;
    setAppSettings(settings);
    setColumnWidths(settings.columnWidths);
    setSlotAssignment(settings.slotAssignment);
    setPresentation(settings.presentation);
  };

  const selectPreset = useCallback((nextMode: ChatMode) => {
    setMode(nextMode);
    const nextRoles = defaultRolesForPreset(nextMode);
    if (nextRoles) setRoles(nextRoles);
  }, []);

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
    setProcessTrace(createProcessTrace(replayMode, replayTargets));
    setIsProcessing(processingAfterSend());
    recordEventLog(eventFromWorkflowStart(replayMode, plan.question?.length ?? 0, replayTargets.length || undefined));
  }, []);

  const settleReplayTrace = useCallback(() => {
    setStepTimeout(undefined);
    setIsProcessing(processingAfterSettle());
  }, []);

  return (
    <main className="h-screen bg-zinc-950 text-zinc-100">
      <div ref={gridRef} className="grid h-full" style={{ gridTemplateColumns: gridTemplateColumns(columnWidths) }}>
        <ProviderColumn
          providers={leftProviders}
          states={states}
          presentation={presentation}
          userHidden={userHidden}
          presentationHidden={centerHidden}
          setPaneRef={setPaneRef}
          openProvider={openProvider}
          togglePaneVisibility={togglePaneVisibility}
          changeProviderPresentation={changeProviderPresentation}
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
              <ConnectionBar states={states} presentation={presentation} mode={mode} targets={targets} onTargetsChange={handleTargetsChange} />
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
          <ChipRail
            providers={chipRailProviders}
            states={states}
            onPromoteSide={(provider) => changeProviderPresentation(provider, 'side')}
            onPromoteCenter={(provider) => changeProviderPresentation(provider, 'center')}
          />
          {centeredProvider ? (
            <CenterStage
              provider={centeredProvider}
              state={states[centeredProvider]}
              setCenterStageRef={setCenterStageRef}
              openProvider={openProvider}
              changeProviderPresentation={changeProviderPresentation}
              syncBounds={syncBounds}
            />
          ) : null}
          <div className="mt-3">
            <PresetCatalog
              mode={mode}
              onSelectPreset={selectPreset}
              advancedOpen={advancedControlsOpen}
              onAdvancedOpenChange={setAdvancedControlsOpen}
            >
              <ModeSelector mode={mode} onModeChange={setMode} />
              <RoleConfig mode={mode} roles={roles} onRolesChange={setRoles} />
              <ReplayPanel
                ref={replayPanelRef}
                onReplayWillRun={prepareReplayTrace}
                onReplaySettled={settleReplayTrace}
                onSnapshotComplete={persistReplaySnapshot}
              />
            </PresetCatalog>
          </div>
          <label className="mt-3 flex w-fit items-center gap-2 border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-500"
              checked={confirmEachStep}
              onChange={(event) => setConfirmEachStep(event.currentTarget.checked)}
              disabled={isProcessing}
            />
            逐步確認 / Confirm each step
          </label>
          {workflowStatus ? <div className="mt-3 border border-sky-900 bg-sky-950 px-3 py-2 text-xs text-sky-200">{workflowStatus}</div> : null}
          {sessionCheckpointNotice ? (
            <SessionCheckpointNotice
              notice={sessionCheckpointNotice}
              replaying={sessionCheckpointReplayBusy}
              onDismiss={dismissStartupSessionCheckpoint}
              onReplay={sessionCheckpointNotice.replaySnapshot ? replayStartupSessionCheckpoint : undefined}
            />
          ) : null}
          <CheckpointCard
            checkpoint={checkpoint}
            draft={checkpointDraft}
            onDraftChange={setCheckpointDraft}
            onNativeEdit={(provider) => {
              void changeProviderPresentation(provider, 'center');
            }}
          />
          {processTrace ? <ProcessTrace trace={processTrace} /> : null}
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
          presentation={presentation}
          userHidden={userHidden}
          presentationHidden={centerHidden}
          setPaneRef={setPaneRef}
          openProvider={openProvider}
          togglePaneVisibility={togglePaneVisibility}
          changeProviderPresentation={changeProviderPresentation}
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
        />
      ) : null}
    </main>
  );
}

function ProviderColumn({
  providers,
  states,
  presentation,
  userHidden,
  presentationHidden,
  setPaneRef,
  openProvider,
  togglePaneVisibility,
  changeProviderPresentation,
  accessProvider,
  toggleAdapterAccess,
  syncBounds,
  reportProvider,
  reportBusy,
}: {
  providers: AIProvider[];
  states: Record<AIProvider, ProviderState>;
  presentation: PresentationByProvider;
  userHidden: ReadonlySet<AIProvider>;
  presentationHidden: ReadonlySet<AIProvider>;
  setPaneRef: (provider: AIProvider, el: HTMLDivElement | null) => void;
  openProvider: (provider: AIProvider) => Promise<void>;
  togglePaneVisibility: (provider: AIProvider) => Promise<void>;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  accessProvider: AIProvider | null;
  toggleAdapterAccess: (provider: AIProvider) => void;
  syncBounds: (provider: AIProvider) => Promise<void>;
  reportProvider: (provider: AIProvider) => Promise<void>;
  reportBusy: boolean;
}) {
  return (
    <aside className="space-y-3 border-zinc-800 p-3">
      {providers.map((provider) => {
        const hiddenByUser = userHidden.has(provider);
        const hiddenByCenter = presentationHidden.has(provider);
        const hidden = hiddenByUser || hiddenByCenter;
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
                  disabled={states[provider].webview !== 'loaded' || hiddenByCenter}
                >
                  {hiddenByCenter ? 'Hidden' : hiddenByUser ? 'Show' : 'Hide'}
                </button>
                <button
                  className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  onClick={() => void changeProviderPresentation(provider, 'chip')}
                >
                  Chip
                </button>
                <button
                  className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  onClick={() => void changeProviderPresentation(provider, 'center')}
                  disabled={presentation[provider] === 'center'}
                >
                  Center
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

function ChipRail({
  providers,
  states,
  onPromoteSide,
  onPromoteCenter,
}: {
  providers: AIProvider[];
  states: Record<AIProvider, ProviderState>;
  onPromoteSide: (provider: AIProvider) => Promise<void>;
  onPromoteCenter: (provider: AIProvider) => Promise<void>;
}) {
  if (providers.length === 0) return null;

  return (
    <section className="mt-3 flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
      {providers.map((provider) => (
        <div key={provider} className="flex items-center gap-1 border border-zinc-700 bg-zinc-900 text-xs">
          <button className="px-2 py-1.5 text-left hover:bg-zinc-800" onClick={() => void onPromoteSide(provider)}>
            <span className="font-medium text-zinc-100">{AI_PROVIDERS[provider].name}</span>
            <span className="ml-2 text-zinc-400">{chipState(states[provider], 'chip').label}</span>
          </button>
          <button className="border-l border-zinc-700 px-2 py-1.5 text-zinc-300 hover:bg-zinc-800" onClick={() => void onPromoteCenter(provider)}>
            Center
          </button>
        </div>
      ))}
    </section>
  );
}

function CenterStage({
  provider,
  state,
  setCenterStageRef,
  openProvider,
  changeProviderPresentation,
  syncBounds,
}: {
  provider: AIProvider;
  state: ProviderState;
  setCenterStageRef: (el: HTMLDivElement | null) => void;
  openProvider: (provider: AIProvider) => Promise<void>;
  changeProviderPresentation: (provider: AIProvider, state: WebviewPresentationState) => Promise<void>;
  syncBounds: (provider: AIProvider) => Promise<void>;
}) {
  return (
    <section
      ref={setCenterStageRef}
      className="mt-3 flex min-h-[340px] flex-col border border-sky-900 bg-zinc-900"
    >
      <div className="flex items-center justify-between gap-2 border-b border-sky-900 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">{AI_PROVIDERS[provider].name}</span>
        <div className="flex flex-wrap justify-end gap-2 text-xs">
          <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void changeProviderPresentation(provider, 'side')}>
            Side
          </button>
          <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void changeProviderPresentation(provider, 'chip')}>
            Chip
          </button>
          <button className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800" onClick={() => void host.provider.openLogin(provider)}>
            Login
          </button>
          <button
            className="border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
            onClick={() => {
              resetProviderBootState(provider);
              void host.provider.reload(provider).then(() => syncBounds(provider));
            }}
            disabled={state.webview !== 'loaded'}
          >
            Reload
          </button>
        </div>
      </div>
      {state.adapter === 'broken' ? <div className="border-b border-red-900 bg-red-950 px-3 py-2 text-xs text-red-200">Adapter broken</div> : null}
      {state.bridge === 'degraded' ? (
        <div className="border-b border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">Bridge degraded. Reload suggested.</div>
      ) : null}
      {state.webview === 'loaded' ? (
        <div className="grid flex-1 place-items-center p-3 text-xs text-zinc-500">Native webview centered here</div>
      ) : (
        <div className="grid flex-1 place-items-center">
          <button className="border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800" onClick={() => void openProvider(provider)}>
            Open {AI_PROVIDERS[provider].name}
          </button>
        </div>
      )}
    </section>
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
  presentation,
  mode,
  targets,
  onTargetsChange,
}: {
  states: Record<AIProvider, ProviderState>;
  presentation: PresentationByProvider;
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
          const chip = chipState(states[provider], presentation[provider]);
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

function chipState(state: ProviderState, presentation: WebviewPresentationState = 'side'): { label: string; className: string } {
  if (presentation === 'chip') return { label: 'session-ready', className: 'border-zinc-700 text-zinc-300' };
  if (state.webview !== 'loaded') return { label: 'no-webview', className: 'border-zinc-700 text-zinc-400' };
  if (state.adapter === 'broken') return { label: 'adapter-broken', className: 'border-red-700 text-red-300' };
  if (state.bridge === 'degraded') return { label: 'degraded', className: 'border-amber-700 text-amber-300' };
  if (state.login === 'logged_out' || state.login === 'blocked') return { label: 'needs-login', className: 'border-amber-700 text-amber-300' };
  if (!isSendable(state)) return { label: 'stale', className: 'border-sky-700 text-sky-300' };
  return { label: 'ready', className: 'border-emerald-700 text-emerald-300' };
}

function modeFromReplayPlan(plan: ReplayPlan): ChatMode | undefined {
  const candidate = plan.graph?.mode ?? plan.graph?.id;
  return typeof candidate === 'string' && candidate in CHAT_MODES ? (candidate as ChatMode) : undefined;
}
