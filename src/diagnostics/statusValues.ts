import type { ProviderState } from '../../shared/types';

export type DebugBridgeStatus = NonNullable<ProviderState['bridge']> | 'unknown';
export type DebugAdapterStatus = NonNullable<ProviderState['adapter']> | 'unknown';

const DOM_STATUSES = ['unknown', 'ready'] as const satisfies readonly ProviderState['dom'][];
const LOGIN_STATUSES = ['unknown', 'logged_in', 'logged_out', 'blocked'] as const satisfies readonly ProviderState['login'][];
const BRIDGE_STATUSES = ['unknown', 'ok', 'degraded'] as const satisfies readonly DebugBridgeStatus[];
const ADAPTER_STATUSES = ['unknown', 'ok', 'broken'] as const satisfies readonly DebugAdapterStatus[];
const STATUS_REASONS = ['pull_failed', 'done_truncated', 'chunk_truncated', 'outbox_full_no_chunk', 'outbox_degraded'] as const;

export function normalizeDomStatus(value: unknown): ProviderState['dom'] {
  return oneOf(value, DOM_STATUSES, 'unknown');
}

export function normalizeLoginStatus(value: unknown): ProviderState['login'] {
  return oneOf(value, LOGIN_STATUSES, 'unknown');
}

export function normalizeBridgeStatus(value: unknown): DebugBridgeStatus {
  return oneOf(value, BRIDGE_STATUSES, 'unknown');
}

export function normalizeAdapterStatus(value: unknown): DebugAdapterStatus {
  return oneOf(value, ADAPTER_STATUSES, 'unknown');
}

export function normalizeStatusReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return oneOf(trimmed, STATUS_REASONS, null);
}

function oneOf<T extends string, F>(value: unknown, allowed: readonly T[], fallback: F): T | F {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
