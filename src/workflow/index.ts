import type { AIProvider, ChatMode, ModeRoles } from '../../shared/types';
import { CHAT_MODES } from '../../shared/constants';
import { host } from '../host';
import { getInFlightProviders } from './cancel';
import { emitSystemError, sendWorkflowStatus } from './events';
import { executeGraph, preflightGraph, workflowGraphs } from './graph';
import type { PreflightResult } from './preflight';
import { prepareWorkflowRun } from './runtime';
import { isSendable } from './sendability';
import { persistSnapshotIfEnabled } from './snapshot/persistence';
import type { SnapshotRedactionTier } from './snapshot/types';
import { tearDownWaiters } from './teardown';

export interface RunWorkflowParams {
  text: string;
  mode: ChatMode;
  roles?: ModeRoles;
  targets?: AIProvider[];
  snapshotPersistence?: boolean;
  snapshotRedactionTier?: SnapshotRedactionTier;
}

export type RunWorkflowResult = { ok: true } | { ok: false; preflight: PreflightResult };

export async function runWorkflow({
  text,
  mode,
  roles,
  targets,
  snapshotPersistence,
  snapshotRedactionTier,
}: RunWorkflowParams): Promise<RunWorkflowResult> {
  prepareWorkflowRun();
  const snapshotOptions = {
    enabled: snapshotPersistence,
    tier: snapshotRedactionTier,
  };
  try {
    if (!CHAT_MODES[mode].serial) {
      const snapshot = await host.connections.get();
      const sendable = snapshot.filter(isSendable).map((state) => state.provider);
      const targetSet = targets === undefined ? sendable : targets.filter((provider) => sendable.includes(provider));
      await executeGraph(workflowGraphs.free, { text, targets: targetSet }, {
        onSnapshotComplete: (snapshot) => persistSnapshotIfEnabled(snapshot, snapshotOptions),
      });
      return { ok: true };
    }

    const serialMode = mode as Exclude<ChatMode, 'free'>;
    const graph = workflowGraphs[serialMode];
    const preflight = await preflightGraph(graph, roles);
    if (!preflight.ok) return { ok: false, preflight };

    await executeGraph(graph, { text, roles }, {
      onSnapshotComplete: (snapshot) => persistSnapshotIfEnabled(snapshot, snapshotOptions),
    });

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
