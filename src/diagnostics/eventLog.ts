import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, BridgeMessage, ChatMode, ProviderState } from '../../shared/types';
import {
  normalizeAdapterStatus,
  normalizeBridgeStatus,
  normalizeDomStatus,
  normalizeLoginStatus,
  normalizeStatusReason,
} from './statusValues';

export const EVENT_LOG_CAP = 2_000;

export type EventLogKind =
  | 'provider-state'
  | 'adapter-notice'
  | 'nav-blocked'
  | 'send'
  | 'response'
  | 'response-error'
  | 'workflow-step'
  | 'workflow-error';

export type EventLogDetailValue = string | number | boolean | null;
export type EventLogDetail = Record<string, EventLogDetailValue>;

export interface EventLogEvent {
  ts: number;
  provider?: AIProvider;
  kind: EventLogKind;
  summary: string;
  detail?: EventLogDetail;
}

export type EventLogInput = Omit<EventLogEvent, 'ts'> & { ts?: number };
export type EventLogProviderFilter = 'all' | AIProvider;

export interface AdapterNoticeLike {
  provider: string;
  kind: string;
  message?: string;
  version?: number | null;
}

export interface NavBlockedLike {
  provider: string;
  host: string;
}

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];
const SENSITIVE_DETAIL_KEYS = new Set([
  'text',
  'prompt',
  'reply',
  'body',
  'content',
  'payload',
  'token',
  'secret',
  'cookie',
  'cookies',
  'session',
  'sessiondata',
  'authorization',
]);
const MAX_SUMMARY_CHARS = 240;
const MAX_DETAIL_CHARS = 400;

export function appendEvent(
  events: readonly EventLogEvent[],
  event: EventLogInput,
  options: { cap?: number; now?: () => number } = {},
): EventLogEvent[] {
  const cap = options.cap ?? EVENT_LOG_CAP;
  const next = [
    ...events,
    sanitizeEvent({
      ...event,
      ts: event.ts ?? options.now?.() ?? Date.now(),
    }),
  ];
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

export function eventFromProviderState(state: ProviderState, source: 'snapshot' | 'update' = 'update'): EventLogInput {
  const bridge = normalizeBridgeStatus(state.bridge);
  const adapter = normalizeAdapterStatus(state.adapter);
  const login = normalizeLoginStatus(state.login);
  const dom = normalizeDomStatus(state.dom);
  const bridgeReason = normalizeStatusReason(state.bridgeReason);
  return {
    provider: state.provider,
    kind: 'provider-state',
    summary: `${providerName(state.provider)} state: bridge ${bridge}, adapter ${adapter}, login ${login}, dom ${dom}, thinking ${
      state.thinking ? 'yes' : 'no'
    }`,
    detail: {
      source,
      webview: state.webview,
      dom,
      login,
      thinking: state.thinking,
      bridge,
      bridgeReason,
      adapter,
      lastStatusAt: state.lastStatusAt,
    },
  };
}

export function eventFromAdapterNotice(notice: AdapterNoticeLike): EventLogInput {
  const provider = isAIProvider(notice.provider) ? notice.provider : undefined;
  const version = typeof notice.version === 'number' ? notice.version : null;
  const reason = notice.message ? clamp(notice.message, MAX_SUMMARY_CHARS) : null;
  return {
    provider,
    kind: 'adapter-notice',
    summary: `${provider ? providerName(provider) : notice.provider} adapter ${notice.kind}${version != null ? ` v${version}` : ''}${
      reason ? `: ${reason}` : ''
    }`,
    detail: {
      noticeKind: notice.kind,
      version,
      reason,
    },
  };
}

export function eventFromNavBlocked(payload: NavBlockedLike): EventLogInput {
  const provider = isAIProvider(payload.provider) ? payload.provider : undefined;
  const host = clamp(payload.host, MAX_DETAIL_CHARS);
  return {
    provider,
    kind: 'nav-blocked',
    summary: `${provider ? providerName(provider) : payload.provider} navigation blocked: ${host}`,
    detail: {
      host,
    },
  };
}

export function eventFromProviderSend(provider: AIProvider, prompt: string): EventLogInput {
  return {
    provider,
    kind: 'send',
    summary: `${providerName(provider)} send queued (${prompt.length} chars)`,
    detail: {
      promptChars: prompt.length,
    },
  };
}

export function eventFromWorkflowStart(mode: ChatMode, promptChars: number, targetCount?: number): EventLogInput {
  return {
    kind: 'workflow-step',
    summary: `${mode} workflow started (${promptChars} prompt chars)`,
    detail: {
      mode,
      promptChars,
      targetCount: targetCount ?? null,
    },
  };
}

export function eventFromWorkflowSettled(mode: ChatMode, durationMs?: number): EventLogInput {
  return {
    kind: 'workflow-step',
    summary: `${mode} workflow settled${durationMs != null ? ` (${durationMs}ms)` : ''}`,
    detail: { mode, durationMs: durationMs ?? null },
  };
}

export function eventFromWorkflowPreflightBlocked(mode: ChatMode, unavailableCount: number): EventLogInput {
  return {
    kind: 'workflow-error',
    summary: `${mode} workflow preflight blocked (${unavailableCount} unavailable role providers)`,
    detail: {
      mode,
      unavailableCount,
    },
  };
}

export function eventFromSnapshotPersistenceFailure(snapshotId: string, reason: unknown): EventLogInput {
  return {
    kind: 'workflow-error',
    summary: 'Snapshot save failed; run continued',
    detail: {
      snapshotId,
      failure: classifySnapshotPersistenceFailure(reason),
    },
  };
}

export function eventFromStepTimeout(event: { provider: string; remainingMs: number; timedOut: boolean }): EventLogInput {
  const provider = isAIProvider(event.provider) ? event.provider : undefined;
  const name = provider ? providerName(provider) : event.provider;
  return {
    provider,
    kind: event.timedOut ? 'workflow-error' : 'workflow-step',
    summary: event.timedOut
      ? `${name} workflow step timed out`
      : `Waiting on ${name} (${Math.ceil(event.remainingMs / 1000)}s remaining)`,
    detail: {
      remainingMs: event.remainingMs,
      timedOut: event.timedOut,
    },
  };
}

export function eventFromBridgeMessage(message: BridgeMessage): EventLogInput | undefined {
  if (message.action === 'STATUS_REPORT') return statusEvent(message);
  if (message.action === 'RESPONSE_CHUNK' || message.action === 'RESPONSE_DONE') return responseEvent(message);
  if (message.action === 'ADAPTER_UPDATE') return adapterUpdateEvent(message);
  if (message.action === 'WORKFLOW_STATUS') return workflowStatusEvent(message);
  if (message.action === 'ROLE_ASSIGNMENT') return roleAssignmentEvent(message);
  if (message.action === 'CANCEL_WORKFLOW') {
    return {
      kind: 'workflow-error',
      summary: 'Workflow cancelled',
      detail: { transport: message.transport ?? null },
    };
  }
  if (message.action === 'SEND_MESSAGE') return sendMessageEvent(message);
  if (message.action === 'REPORT_BROKEN') {
    const provider = safeProvider(message.provider);
    return {
      provider,
      kind: 'adapter-notice',
      summary: `${provider ? providerName(provider) : 'Provider'} broken-adapter report requested`,
      detail: commonMessageDetail(message),
    };
  }
  return undefined;
}

export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  if (diff < 1000) return 'now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatEventLogText(events: readonly EventLogEvent[]): string {
  return events.map(formatEventLogLine).join('\n');
}

export function formatEventLogLine(event: EventLogEvent): string {
  const provider = event.provider ? ` [${providerName(event.provider)}]` : '';
  const detail = event.detail && Object.keys(event.detail).length > 0 ? ` ${JSON.stringify(event.detail)}` : '';
  return `${new Date(event.ts).toISOString()} ${event.kind}${provider} - ${event.summary}${detail}`;
}

export function filterEventLogByProvider(
  events: readonly EventLogEvent[],
  providerFilter: EventLogProviderFilter,
): readonly EventLogEvent[] {
  return providerFilter === 'all' ? events : events.filter((event) => event.provider === providerFilter);
}

export function providerName(provider: AIProvider): string {
  return AI_PROVIDERS[provider]?.name ?? provider;
}

function statusEvent(message: BridgeMessage): EventLogInput | undefined {
  const provider = safeProvider(message.provider);
  if (!provider) return undefined;
  const payload = recordPayload(message.payload);
  const parts: string[] = [];
  const dom = optionalStatus(payload, 'dom', normalizeDomStatus);
  const login = optionalStatus(payload, 'login', normalizeLoginStatus);
  const bridge = optionalStatus(payload, 'bridge', normalizeBridgeStatus);
  const adapter = optionalStatus(payload, 'adapter', normalizeAdapterStatus);
  const reason = normalizeStatusReason(payload?.reason);
  const thinking = booleanProp(payload, 'thinking');
  const bulkReady = numberProp(payload, 'bulkReady');
  const doneReady = booleanProp(payload, 'doneReady');
  if (dom) parts.push(`dom ${dom}`);
  if (login) parts.push(`login ${login}`);
  if (typeof thinking === 'boolean') parts.push(`thinking ${thinking ? 'yes' : 'no'}`);
  if (bridge) parts.push(`bridge ${bridge}`);
  if (adapter) parts.push(`adapter ${adapter}`);
  if (typeof bulkReady === 'number') parts.push(`bulk ready ${bulkReady}`);
  if (doneReady === true) parts.push('done ready');
  return {
    provider,
    kind: 'provider-state',
    summary: `${providerName(provider)} status: ${parts.length > 0 ? parts.join(', ') : 'status report'}`,
    detail: {
      ...commonMessageDetail(message),
      dom: dom ?? null,
      login: login ?? null,
      thinking: thinking ?? null,
      bridge: bridge ?? null,
      adapter: adapter ?? null,
      reason,
      bulkReady: bulkReady ?? null,
      doneReady: doneReady ?? null,
    },
  };
}

function responseEvent(message: BridgeMessage): EventLogInput | undefined {
  const provider = safeProvider(message.provider);
  const info = payloadInfo(message.payload);
  const isDone = message.action === 'RESPONSE_DONE';
  const errorLike = isDone ? info.errorLike : false;
  if (errorLike && !provider) {
    return {
      kind: 'workflow-error',
      summary: `Workflow response error (${info.chars} chars)`,
      detail: {
        ...commonMessageDetail(message),
        chars: info.chars,
        truncated: info.truncated,
        errorLike,
      },
    };
  }
  if (!provider) return undefined;
  if (errorLike) {
    return {
      provider,
      kind: 'response-error',
      summary: `${providerName(provider)} response error (${info.chars} chars)`,
      detail: {
        ...commonMessageDetail(message),
        chars: info.chars,
        truncated: info.truncated,
        errorLike,
      },
    };
  }
  return {
    provider,
    kind: 'response',
    summary: `${providerName(provider)} ${isDone ? 'response done' : 'response chunk'} (${info.chars} chars)`,
    detail: {
      ...commonMessageDetail(message),
      chars: info.chars,
      truncated: info.truncated,
      errorLike,
    },
  };
}

function adapterUpdateEvent(message: BridgeMessage): EventLogInput | undefined {
  const provider = safeProvider(message.provider);
  if (!provider) return undefined;
  const payload = recordPayload(message.payload);
  const adapterVersion = numberProp(payload, 'adapterVersion');
  const schemaVersion = numberProp(payload, 'schemaVersion');
  return {
    provider,
    kind: 'adapter-notice',
    summary: `${providerName(provider)} adapter update${adapterVersion != null ? ` v${adapterVersion}` : ''}`,
    detail: {
      ...commonMessageDetail(message),
      adapterVersion: adapterVersion ?? null,
      schemaVersion: schemaVersion ?? null,
    },
  };
}

function workflowStatusEvent(message: BridgeMessage): EventLogInput {
  const status = typeof message.payload === 'string' ? message.payload : '';
  return {
    kind: 'workflow-step',
    summary: status ? `Workflow status: ${clamp(status, MAX_SUMMARY_CHARS)}` : 'Workflow status cleared',
    detail: {
      ...commonMessageDetail(message),
      statusChars: status.length,
    },
  };
}

function roleAssignmentEvent(message: BridgeMessage): EventLogInput | undefined {
  const provider = safeProvider(message.provider);
  if (!provider) return undefined;
  const payload = recordPayload(message.payload);
  const role = stringProp(payload, 'role');
  const label = stringProp(payload, 'label');
  const turn = numberProp(payload, 'turn');
  return {
    provider,
    kind: 'workflow-step',
    summary: `${providerName(provider)} assigned workflow role ${label ?? role ?? 'unknown'}`,
    detail: {
      ...commonMessageDetail(message),
      role: role ?? null,
      label: label ?? null,
      turn: turn ?? null,
    },
  };
}

function sendMessageEvent(message: BridgeMessage): EventLogInput | undefined {
  const provider = safeProvider(message.provider);
  if (!provider) return undefined;
  const payload = recordPayload(message.payload);
  const text = stringProp(payload, 'text');
  return {
    provider,
    kind: 'send',
    summary: `${providerName(provider)} send dispatched (${text?.length ?? 0} chars)`,
    detail: {
      ...commonMessageDetail(message),
      promptChars: text?.length ?? 0,
    },
  };
}

function commonMessageDetail(message: BridgeMessage): EventLogDetail {
  return {
    action: message.action,
    transport: message.transport ?? null,
    bootId: message.bootId ?? null,
    seq: message.seq ?? null,
    mid: message.mid ?? null,
  };
}

function payloadInfo(payload: unknown): { chars: number; truncated: boolean; errorLike: boolean } {
  const value = payloadText(payload);
  return {
    chars: value.text.length,
    truncated: value.truncated,
    errorLike: errorLikeResponse(value.text),
  };
}

function payloadText(payload: unknown): { text: string; truncated: boolean } {
  if (typeof payload === 'string') return { text: payload, truncated: false };
  const record = recordPayload(payload);
  const text = stringProp(record, 'text');
  if (text !== undefined) return { text, truncated: booleanProp(record, 'truncated') === true };
  return { text: payload == null ? '' : JSON.stringify(payload), truncated: booleanProp(record, 'truncated') === true };
}

function errorLikeResponse(text: string): boolean {
  return /^\[Error:\s*[\s\S]*?\]$/.test(text) || text.startsWith('Error:');
}

function sanitizeEvent(event: EventLogEvent): EventLogEvent {
  const detail = sanitizeDetail(event.detail);
  return {
    ts: event.ts,
    provider: safeProvider(event.provider),
    kind: event.kind,
    summary: clamp(event.summary, MAX_SUMMARY_CHARS),
    ...(detail ? { detail } : {}),
  };
}

function sanitizeDetail(detail: EventLogDetail | undefined): EventLogDetail | undefined {
  if (!detail) return undefined;
  const next: EventLogDetail = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_DETAIL_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') next[key] = clamp(value, MAX_DETAIL_CHARS);
    else if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
    else if (typeof value === 'boolean' || value === null) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function recordPayload(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringProp(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberProp(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanProp(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function optionalStatus<T extends string>(
  record: Record<string, unknown> | undefined,
  key: string,
  normalize: (value: unknown) => T,
): T | undefined {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return normalize(record[key]);
}

function safeProvider(provider: unknown): AIProvider | undefined {
  return typeof provider === 'string' && isAIProvider(provider) ? provider : undefined;
}

function isAIProvider(provider: string): provider is AIProvider {
  return PROVIDERS.includes(provider as AIProvider);
}

function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}...`;
}

function classifySnapshotPersistenceFailure(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/denied|permission/i.test(message)) return 'permission';
  if (/space|full|quota/i.test(message)) return 'disk';
  if (/invalid.*snapshot.*id/i.test(message)) return 'invalid-id';
  return 'write-failed';
}
