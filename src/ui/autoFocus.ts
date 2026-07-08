import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, BridgeMessage } from '../../shared/types';
import type { WebviewPresentationState } from './presentation';

export const MANUAL_LOCK_IDLE_MS = 30000;
export const POINTERDOWN_DEBOUNCE_MS = 500;

export interface ManualFocusLock {
  provider: AIProvider;
  at: number;
}

export interface ManualFocusPointerDown {
  provider: AIProvider;
  at: number;
}

export function providerFromRoleAssignment(message: BridgeMessage): AIProvider | undefined {
  if (message.action !== 'ROLE_ASSIGNMENT') return undefined;
  return isAIProvider(message.provider) ? message.provider : undefined;
}

export function shouldAutoFocus({
  autoFollowEnabled,
  manualLock,
  candidate,
  centered,
}: {
  autoFollowEnabled: boolean;
  manualLock?: ManualFocusLock;
  candidate?: AIProvider;
  centered?: AIProvider;
}): boolean {
  return autoFollowEnabled && !manualLock && candidate !== undefined && candidate !== centered;
}

export function manualFocusLockForControl(
  provider: AIProvider,
  currentPresentation: WebviewPresentationState,
  now: number,
): ManualFocusLock | undefined {
  if (currentPresentation === 'center') return undefined;
  return { provider, at: now };
}

export function refreshManualLockOnRoleAssignment(
  manualLock: ManualFocusLock | undefined,
  now: number,
  options: { idlePaused?: boolean } = {},
): ManualFocusLock | undefined {
  if (!manualLock) return undefined;
  if (options.idlePaused) return { ...manualLock, at: now };
  if (now - manualLock.at >= MANUAL_LOCK_IDLE_MS) return undefined;
  return { ...manualLock, at: now };
}

export function pointerDebounceLock(pointerDown: ManualFocusPointerDown | undefined, now: number): ManualFocusLock | undefined {
  if (!pointerDown) return undefined;
  if (now - pointerDown.at >= POINTERDOWN_DEBOUNCE_MS) return undefined;
  return { provider: pointerDown.provider, at: pointerDown.at };
}

function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && value in AI_PROVIDERS;
}
