import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, BridgeMessage, ChatMode, WorkflowPresetId } from '../../shared/types';
import type { Locale } from '../i18n/resolve';
import { t } from '../i18n/t';

export type ProcessTraceStepStatus = 'pending' | 'active' | 'done';

export interface ProcessTraceStep {
  id: string;
  kind: 'fanout' | 'response' | 'role';
  label: string;
  detail?: string;
  content?: string;
  provider?: AIProvider;
  role?: string;
  turn?: number;
  status: ProcessTraceStepStatus;
}

export interface ProcessTraceState {
  mode: ChatMode;
  currentStatus: string;
  steps: ProcessTraceStep[];
}

export function createProcessTrace(
  mode: ChatMode,
  targets: AIProvider[] = [],
  locale: Locale = 'en',
  presetId?: WorkflowPresetId,
): ProcessTraceState {
  if (mode !== 'free' || presetId === 'brainstorm') return { mode, currentStatus: '', steps: [] };

  return {
    mode,
    currentStatus: '',
    steps: [
      {
        id: 'free-fanout',
        kind: 'fanout',
        label: t('processTrace.fanout', locale),
        detail: targets.length > 0 ? `${t('processTrace.sendingTo', locale)} ${providerNames(targets)}` : t('processTrace.noSelectedAI', locale),
        status: targets.length > 0 ? 'active' : 'done',
      },
      ...targets.map((provider) => responseStep(provider, 'pending', locale)),
    ],
  };
}

export function reduceProcessTraceEvent(trace: ProcessTraceState, message: BridgeMessage, locale: Locale = 'en'): ProcessTraceState {
  if (message.action === 'WORKFLOW_STATUS') {
    const status = typeof message.payload === 'string' ? message.payload : '';
    return applyWorkflowStatus(trace, status);
  }

  if (message.action === 'ROLE_ASSIGNMENT' && isKnownProvider(message.provider)) {
    const payload = rolePayload(message.payload);
    return addRoleStep(trace, message.provider, payload.role, payload.label, payload.turn, locale);
  }

  if (isTraceResponse(message) && isKnownProvider(message.provider)) {
    return applyProviderResponse(trace, message.provider, message.action === 'RESPONSE_DONE', responsePayloadText(message.payload), locale);
  }

  return trace;
}

export function settleProcessTrace(trace: ProcessTraceState): ProcessTraceState {
  return {
    ...trace,
    currentStatus: '',
    steps: refreshFreeAggregate(
      trace.steps.map((step) => (step.status === 'done' ? step : { ...step, status: 'done' })),
    ),
  };
}

function applyWorkflowStatus(trace: ProcessTraceState, status: string): ProcessTraceState {
  if (!status) return settleProcessTrace(trace);
  const steps =
    trace.currentStatus && trace.currentStatus !== status
      ? trace.steps.map((step) => (step.kind === 'role' && step.status === 'active' ? { ...step, status: 'done' as const } : step))
      : trace.steps;
  return { ...trace, currentStatus: status, steps };
}

function addRoleStep(
  trace: ProcessTraceState,
  provider: AIProvider,
  role: string | undefined,
  label: string | undefined,
  turn: number | undefined,
  locale: Locale,
): ProcessTraceState {
  const providerName = AI_PROVIDERS[provider].name;
  const displayRole = label || role || t('processTrace.step', locale);
  const step: ProcessTraceStep = {
    id: turn === undefined ? `role-${trace.steps.length}-${provider}` : `role-${provider}-${turn}`,
    kind: 'role',
    provider,
    role,
    turn,
    label: `${displayRole} · ${providerName}`,
    detail: role && label && role !== label ? role : undefined,
    status: 'active',
  };
  return { ...trace, steps: [...trace.steps, step] };
}

function applyProviderResponse(
  trace: ProcessTraceState,
  provider: AIProvider,
  final: boolean,
  content: string,
  locale: Locale,
): ProcessTraceState {
  const nextStatus: ProcessTraceStepStatus = final ? 'done' : 'active';
  let matchIndex = -1;
  for (let index = trace.steps.length - 1; index >= 0; index -= 1) {
    const step = trace.steps[index];
    if (step.provider === provider && (step.kind === 'role' || step.kind === 'response') && step.status !== 'done') {
      matchIndex = index;
      break;
    }
  }
  const steps = trace.steps.map((step, index) =>
    index === matchIndex
      ? {
          ...step,
          status: nextStatus,
          content: content || step.content,
          detail: content ? oneLinePreview(content) : step.detail,
        }
      : step,
  );

  const nextSteps = matchIndex >= 0 || trace.mode !== 'free' ? steps : [...steps, responseStep(provider, nextStatus, locale, content)];
  return { ...trace, steps: refreshFreeAggregate(nextSteps) };
}

function refreshFreeAggregate(steps: ProcessTraceStep[]): ProcessTraceStep[] {
  const responseRows = steps.filter((step) => step.kind === 'response');
  if (responseRows.length === 0) return steps;
  const aggregateStatus: ProcessTraceStepStatus = responseRows.every((step) => step.status === 'done') ? 'done' : 'active';
  return steps.map((step) => (step.kind === 'fanout' ? { ...step, status: aggregateStatus } : step));
}

function responseStep(provider: AIProvider, status: ProcessTraceStepStatus, locale: Locale, content = ''): ProcessTraceStep {
  return {
    id: `free-response-${provider}`,
    kind: 'response',
    provider,
    label: `${AI_PROVIDERS[provider].name} ${t('processTrace.response', locale)}`,
    detail: content ? oneLinePreview(content) : t('processTrace.waitingForResponse', locale),
    content: content || undefined,
    status,
  };
}

function responsePayloadText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const text = (payload as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
}

function oneLinePreview(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 179)}…` : compact;
}

function rolePayload(payload: unknown): { role?: string; label?: string; turn?: number } {
  if (!payload || typeof payload !== 'object') return {};
  const typed = payload as { role?: unknown; label?: unknown; turn?: unknown };
  return {
    role: typeof typed.role === 'string' ? typed.role : undefined,
    label: typeof typed.label === 'string' ? typed.label : undefined,
    turn: typeof typed.turn === 'number' ? typed.turn : undefined,
  };
}

function isTraceResponse(message: BridgeMessage): boolean {
  return (
    (message.action === 'RESPONSE_CHUNK' || message.action === 'RESPONSE_DONE') &&
    Boolean(message.provider) &&
    (message.transport === 'pull' || message.transport === 'local')
  );
}

function isKnownProvider(provider: unknown): provider is AIProvider {
  return typeof provider === 'string' && provider in AI_PROVIDERS;
}

function providerNames(providers: AIProvider[]): string {
  return providers.map((provider) => AI_PROVIDERS[provider].name).join(', ');
}
