import type { ChatMode } from '../../shared/types';
import type { RunWorkflowResult } from '../workflow';
import type { PreflightResult } from '../workflow/preflight';

export function preflightFromResult(
  mode: ChatMode,
  result: RunWorkflowResult,
): { mode: Exclude<ChatMode, 'free'>; result: PreflightResult } | undefined {
  if (mode === 'free' || result.ok) return undefined;
  return { mode, result: result.preflight };
}
