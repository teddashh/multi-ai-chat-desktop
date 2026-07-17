import type { ChatMode, WorkflowPresetId } from '../../shared/types';
import type { RunWorkflowResult } from '../workflow';
import type { PreflightResult } from '../workflow/preflight';

export type PreflightSubject = Exclude<ChatMode, 'free'> | 'brainstorm';

export function preflightFromResult(
  mode: ChatMode,
  result: RunWorkflowResult,
  presetId?: WorkflowPresetId,
): { mode: PreflightSubject; result: PreflightResult } | undefined {
  if (result.ok) return undefined;
  if (presetId === 'brainstorm') return { mode: 'brainstorm', result: result.preflight };
  if (mode === 'free') return undefined;
  return { mode, result: result.preflight };
}
