import type { AIProvider, ChatMode, ModeRoles, WorkflowPresetId } from '../../shared/types';
import { CHAT_MODES, DEFAULT_FREE_TARGET_PROVIDERS } from '../../shared/constants';
import { getRuntimeAppVersion } from '../appVersion';
import { host } from '../host';
import type { Locale } from '../i18n/resolve';
import { abortWorkflow, getInFlightProviders } from './cancel';
import { emitSystemError, sendWorkflowStatus } from './events';
import { executeGraph, preflightGraph, workflowGraphs } from './graph';
import type { PreflightResult } from './preflight';
import { prepareWorkflowRun } from './runtime';
import type { ResponseLanguagePolicy } from './responseLanguage';
import { isSendable } from './sendability';
import { persistSnapshotIfEnabled } from './snapshot/persistence';
import type { SnapshotRedactionTier } from './snapshot/types';
import { tearDownWaiters } from './teardown';
import { cancelPendingStepTimeoutAction } from './stepTimeout';

export interface RunWorkflowParams {
  text: string;
  context?: string;
  mode: ChatMode;
  presetId?: WorkflowPresetId;
  roles?: ModeRoles;
  targets?: AIProvider[];
  activeProviders?: readonly AIProvider[];
  checkpoints?: boolean;
  locale?: Locale;
  snapshotPersistence?: boolean;
  snapshotRedactionTier?: SnapshotRedactionTier;
  responseLanguagePolicy?: ResponseLanguagePolicy;
}

export type RunWorkflowResult = { ok: true } | { ok: false; preflight: PreflightResult };

interface ActiveWorkflowRun {
  settled: Promise<void>;
  finish: () => void;
}

let activeWorkflowRun: ActiveWorkflowRun | undefined;
let workflowStartGate = Promise.resolve();

export async function runWorkflow(params: RunWorkflowParams): Promise<RunWorkflowResult> {
  const run = await beginWorkflowRun();
  try {
    return await runPreparedWorkflow(params);
  } finally {
    run.finish();
  }
}

async function runPreparedWorkflow({
  text,
  context,
  mode,
  presetId,
  roles,
  targets,
  activeProviders,
  checkpoints,
  locale,
  snapshotPersistence,
  snapshotRedactionTier,
  responseLanguagePolicy,
}: RunWorkflowParams): Promise<RunWorkflowResult> {
  const snapshotOptions = {
    enabled: snapshotPersistence,
    tier: snapshotRedactionTier,
  };
  try {
    const appVersion = await getRuntimeAppVersion();
    const graphOptions = {
      onSnapshotComplete: (snapshot: Parameters<typeof persistSnapshotIfEnabled>[0]) =>
        persistSnapshotIfEnabled(snapshot, snapshotOptions),
      ...(appVersion ? { appVersion } : {}),
    };
    if (presetId === 'brainstorm') {
      const graph = workflowGraphs.brainstorm;
      const preflight = await preflightGraph(graph, roles, activeProviders);
      if (!preflight.ok) return { ok: false, preflight };

      await executeGraph(graph, { text, context, roles, checkpoints, locale, responseLanguagePolicy }, graphOptions);
      return { ok: true };
    }

    if (!CHAT_MODES[mode].serial) {
      const snapshot = await host.connections.get();
      const sendable = snapshot.filter(isSendable).map((state) => state.provider);
      const active = activeProviders ?? DEFAULT_FREE_TARGET_PROVIDERS;
      const targetSet =
        targets === undefined
          ? sendable.filter((provider) => active.includes(provider))
          : targets.filter((provider) => sendable.includes(provider) && active.includes(provider));
      await executeGraph(
        workflowGraphs.free,
        { text, context, targets: targetSet, checkpoints, locale, responseLanguagePolicy },
        graphOptions,
      );
      return { ok: true };
    }

    const serialMode = mode as Exclude<ChatMode, 'free'>;
    const graph = workflowGraphs[serialMode];
    const preflight = await preflightGraph(graph, roles, activeProviders);
    if (!preflight.ok) return { ok: false, preflight };

    await executeGraph(graph, { text, context, roles, checkpoints, locale, responseLanguagePolicy }, graphOptions);

    return { ok: true };
  } catch (error) {
    await tearDownWaiters(getInFlightProviders(), { stopClick: true });
    emitSystemError((error as Error).message);
    sendWorkflowStatus('');
    return { ok: true };
  }
}

async function beginWorkflowRun(): Promise<ActiveWorkflowRun> {
  const releaseStartGate = await acquireWorkflowStartGate();
  try {
    const previous = activeWorkflowRun;
    if (previous) {
      const previousProviders = getInFlightProviders();
      abortWorkflow();
      cancelPendingStepTimeoutAction();
      const cleanup = tearDownWaiters(previousProviders, { stopClick: true });
      await Promise.allSettled([previous.settled, cleanup]);
    }

    prepareWorkflowRun();
    let resolveSettled = () => {};
    const run: ActiveWorkflowRun = {
      settled: new Promise<void>((resolve) => {
        resolveSettled = resolve;
      }),
      finish: () => {
        if (activeWorkflowRun === run) activeWorkflowRun = undefined;
        resolveSettled();
      },
    };
    activeWorkflowRun = run;
    return run;
  } finally {
    releaseStartGate();
  }
}

async function acquireWorkflowStartGate(): Promise<() => void> {
  const previous = workflowStartGate;
  let release = () => {};
  workflowStartGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return release;
}

export { isSendable } from './sendability';
export { resetWorkflowRuntimeForTests } from './runtime';
export { chooseStepTimeoutAction, onStepTimeoutEvent } from './stepTimeout';
