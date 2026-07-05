import type { AIProvider, ChatMode, CodingRoles, ConsultRoles, DebateRoles, ModeRoles, RoundtableRoles } from '../../shared/types';
import {
  CHAT_MODES,
  DEFAULT_CODING_ROLES,
  DEFAULT_CONSULT_ROLES,
  DEFAULT_DEBATE_ROLES,
  DEFAULT_ROUNDTABLE_ROLES,
} from '../../shared/constants';
import { host } from '../host';
import { onBridgeMessage } from '../bridge/bus';
import { abortWorkflow, resetCancelState, getInFlightProviders } from './cancel';
import { emitSystemError, sendWorkflowStatus } from './events';
import { handleCodingMode } from './modes/coding';
import { handleConsultMode } from './modes/consult';
import { handleDebateMode } from './modes/debate';
import { handleFreeMode } from './modes/free';
import { handleRoundtableMode } from './modes/roundtable';
import { preflightSerialMode, type PreflightResult } from './preflight';
import { resetWorkflowState } from './state';
import { tearDownWaiters } from './teardown';
import { cancelPendingStepTimeoutAction, resetStepTimeoutActionState } from './stepTimeout';
import { ensureWorkflowBusSubscription } from './waitForResponse';

let cancelSubscribed = false;

export function resetWorkflowRuntimeForTests(): void {
  cancelSubscribed = false;
}

function ensureCancelSubscription(): void {
  if (cancelSubscribed) return;
  cancelSubscribed = true;
  onBridgeMessage((message) => {
    if (message.action !== 'CANCEL_WORKFLOW') return;
    abortWorkflow();
    cancelPendingStepTimeoutAction();
    void tearDownWaiters(getInFlightProviders(), { stopClick: true });
    sendWorkflowStatus('');
  });
}

export interface RunWorkflowParams {
  text: string;
  mode: ChatMode;
  roles?: ModeRoles;
  targets?: AIProvider[];
}

export type RunWorkflowResult = { ok: true } | { ok: false; preflight: PreflightResult };

export async function runWorkflow({ text, mode, roles, targets }: RunWorkflowParams): Promise<RunWorkflowResult> {
  ensureWorkflowBusSubscription();
  ensureCancelSubscription();
  resetCancelState();
  resetWorkflowState();
  resetStepTimeoutActionState();
  try {
    if (!CHAT_MODES[mode].serial) {
      const snapshot = await host.connections.get();
      await handleFreeMode(text, snapshot, targets);
      return { ok: true };
    }

    const serialMode = mode as Exclude<ChatMode, 'free'>;
    const preflight = await preflightSerialMode(serialMode, roles);
    if (!preflight.ok) return { ok: false, preflight };

    if (mode === 'debate') await handleDebateMode(text, (roles as DebateRoles) ?? DEFAULT_DEBATE_ROLES);
    else if (mode === 'consult') await handleConsultMode(text, (roles as ConsultRoles) ?? DEFAULT_CONSULT_ROLES);
    else if (mode === 'coding') await handleCodingMode(text, (roles as CodingRoles) ?? DEFAULT_CODING_ROLES);
    else await handleRoundtableMode(text, (roles as RoundtableRoles) ?? DEFAULT_ROUNDTABLE_ROLES);

    return { ok: true };
  } catch (error) {
    await tearDownWaiters(getInFlightProviders());
    emitSystemError((error as Error).message);
    sendWorkflowStatus('');
    return { ok: true };
  }
}

export { isSendable } from './sendability';
export { chooseStepTimeoutAction, onStepTimeoutEvent } from './stepTimeout';
