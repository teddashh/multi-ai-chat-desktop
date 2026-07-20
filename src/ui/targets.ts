import type { AIProvider, ProviderState } from '../../shared/types';
import { isSendable } from '../workflow';

export interface FreeTargetSelection {
  targets: AIProvider[];
  defaultsInitialized: boolean;
  userTouched: boolean;
}

export function defaultTargets(states: Record<AIProvider, ProviderState>, providers: AIProvider[]): AIProvider[] {
  return providers.filter((provider) => isSendable(states[provider]));
}

export function applyFreeTargetDefaults(selection: FreeTargetSelection, defaults: AIProvider[]): FreeTargetSelection {
  if (selection.userTouched || selection.defaultsInitialized || defaults.length === 0) return selection;
  return { ...selection, targets: defaults, defaultsInitialized: true };
}

export function markFreeTargetsTouched(selection: FreeTargetSelection, targets: AIProvider[]): FreeTargetSelection {
  return { ...selection, targets, userTouched: true };
}

export function toggleTarget(selected: AIProvider[], provider: AIProvider): AIProvider[] {
  return selected.includes(provider) ? selected.filter((item) => item !== provider) : [...selected, provider];
}

export function freeModeTargets(selected: AIProvider[], states: Record<AIProvider, ProviderState>): AIProvider[] {
  return selected.filter((provider) => isSendable(states[provider]));
}

// Session reset 會讓 provider 頁面重新導航，導航後第一輪 STATUS_REPORT 常誤報
// logged_out/blocked（login detector 還沒渲染出來），下一輪（約 10 秒後）才恢復。
// 送出前等它們回穩，避免 fan-out 目標被暫時性的假狀態默默過濾掉。
export async function waitForProvidersSendable(
  providers: readonly AIProvider[],
  getStates: () => Record<AIProvider, ProviderState>,
  timeoutMs = 20_000,
  pollMs = 250,
  shouldAbort?: () => boolean,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shouldAbort?.()) return;
    const states = getStates();
    if (providers.every((provider) => isSendable(states[provider]))) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  // 超時就照舊只送 sendable 的（真的登出的 provider 最多多等 20 秒）
}

export function hasEffectiveFreeModeTargets(selected: AIProvider[], states: Record<AIProvider, ProviderState>): boolean {
  return freeModeTargets(selected, states).length > 0;
}
