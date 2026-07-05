import type { AIProvider, BridgeMessage } from '../../shared/types';
import { publishBridgeMessage } from '../bridge/bus';

// Provider failures are "[Error: <reason>]" and continue through downstream prompts.
// User skip is "(no response — skipped)" and also flows downstream.
// Top-level workflow failure is "Error: <msg>" from provider "system" and is terminal.

export function sendWorkflowStatus(text: string): void {
  publishBridgeMessage({ v: 1, action: 'WORKFLOW_STATUS', payload: text, transport: 'local' });
}

export function sendRoleAssignment(provider: AIProvider, role: string, label: string, turn: number): void {
  publishBridgeMessage({
    v: 1,
    action: 'ROLE_ASSIGNMENT',
    provider,
    payload: { role, label, turn },
    transport: 'local',
  });
}

export function emitSystemError(message: string): void {
  publishBridgeMessage({
    v: 1,
    action: 'RESPONSE_DONE',
    provider: 'system' as AIProvider,
    payload: `Error: ${message}`,
    transport: 'local',
  } satisfies BridgeMessage);
}
