import type { AIProvider, ChatMode, ModeRoles, WorkflowPresetId } from '../../shared/types';
import { CHAT_MODES, DEFAULT_FREE_TARGET_PROVIDERS } from '../../shared/constants';
import { getRuntimeAppVersion } from '../appVersion';
import { host } from '../host';
import type { Locale } from '../i18n/resolve';
import { getInFlightProviders } from './cancel';
import { emitSystemError, sendWorkflowStatus } from './events';
import { executeGraph, preflightGraph, workflowGraphs } from './graph';
import type { PreflightResult } from './preflight';
import { prepareWorkflowRun } from './runtime';
import type { ResponseLanguagePolicy } from './responseLanguage';
import { isSendable } from './sendability';
import { persistSnapshotIfEnabled } from './snapshot/persistence';
import type { SnapshotRedactionTier } from './snapshot/types';
import { tearDownWaiters } from './teardown';

export interface RunWorkflowParams {
  text: string;
  context?: string;
  mode: ChatMode;
  presetId?: WorkflowPresetId;
  roles?: ModeRoles;
  targets?: AIProvider[];
  checkpoints?: boolean;
  locale?: Locale;
  snapshotPersistence?: boolean;
  snapshotRedactionTier?: SnapshotRedactionTier;
  responseLanguagePolicy?: ResponseLanguagePolicy;
}

export type RunWorkflowResult = { ok: true } | { ok: false; preflight: PreflightResult };

export async function runWorkflow({
  text,
  context,
  mode,
  presetId,
  roles,
  targets,
  checkpoints,
  locale,
  snapshotPersistence,
  snapshotRedactionTier,
  responseLanguagePolicy,
}: RunWorkflowParams): Promise<RunWorkflowResult> {
  prepareWorkflowRun();
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
      const preflight = await preflightGraph(graph, roles);
      if (!preflight.ok) return { ok: false, preflight };

      await executeGraph(graph, { text, context, roles, checkpoints, locale, responseLanguagePolicy }, graphOptions);
      return { ok: true };
    }

    if (!CHAT_MODES[mode].serial) {
      const snapshot = await host.connections.get();
      const sendable = snapshot.filter(isSendable).map((state) => state.provider);
      const targetSet =
        targets === undefined
          ? sendable.filter((provider) => (DEFAULT_FREE_TARGET_PROVIDERS as readonly AIProvider[]).includes(provider))
          : targets.filter((provider) => sendable.includes(provider));
      await executeGraph(
        workflowGraphs.free,
        { text, context, targets: targetSet, checkpoints, locale, responseLanguagePolicy },
        graphOptions,
      );
      return { ok: true };
    }

    const serialMode = mode as Exclude<ChatMode, 'free'>;
    const graph = workflowGraphs[serialMode];
    const preflight = await preflightGraph(graph, roles);
    if (!preflight.ok) return { ok: false, preflight };

    await executeGraph(graph, { text, context, roles, checkpoints, locale, responseLanguagePolicy }, graphOptions);

    return { ok: true };
  } catch (error) {
    await tearDownWaiters(getInFlightProviders());
    emitSystemError((error as Error).message);
    sendWorkflowStatus('');
    return { ok: true };
  }
}

export { isSendable } from './sendability';
export { resetWorkflowRuntimeForTests } from './runtime';
export { chooseStepTimeoutAction, onStepTimeoutEvent } from './stepTimeout';
