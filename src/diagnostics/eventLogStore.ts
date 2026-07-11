import { appendEvent, type EventLogEvent, type EventLogInput } from './eventLog';

type Listener = () => void;

const listeners = new Set<Listener>();
let events: EventLogEvent[] = [];
const pendingProviderSendAt = new Map<string, number>();

export function recordEventLog(event: EventLogInput | undefined): void {
  try {
    if (!event) return;
    const enriched = withProviderDuration(event);
    if (isDuplicateProviderHeartbeat(events, enriched)) return;
    events = appendEvent(events, enriched);
    updatePendingDurations(events[events.length - 1]);
    notifyListeners();
  } catch {
    // Diagnostics must never break the workflow or send path.
  }
}

function isDuplicateProviderHeartbeat(current: readonly EventLogEvent[], event: EventLogInput): boolean {
  if (event.kind !== 'provider-state' || !event.provider) return false;
  const previous = [...current]
    .reverse()
    .find((candidate) => candidate.kind === 'provider-state' && candidate.provider === event.provider);
  if (!previous) return false;
  return previous.summary === event.summary && diagnosticFingerprint(previous.detail) === diagnosticFingerprint(event.detail);
}

function diagnosticFingerprint(detail: EventLogInput['detail']): string {
  if (!detail) return '';
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(detail)
        .filter(([key]) => key !== 'lastStatusAt' && key !== 'seq' && key !== 'mid')
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function getEventLogSnapshot(): readonly EventLogEvent[] {
  return events;
}

export function subscribeEventLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetEventLogForTests(): void {
  events = [];
  pendingProviderSendAt.clear();
  notifyListeners();
}

function notifyListeners(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A bad diagnostics subscriber should not block other subscribers.
    }
  }
}

function withProviderDuration(event: EventLogInput): EventLogInput {
  if (!event.provider || (event.kind !== 'response' && event.kind !== 'response-error')) return event;
  if (event.detail?.action !== 'RESPONSE_DONE') return event;
  const startedAt = pendingProviderSendAt.get(event.provider);
  if (startedAt === undefined) return event;
  const ts = event.ts ?? Date.now();
  return {
    ...event,
    ts,
    detail: {
      ...event.detail,
      durationMs: Math.max(0, ts - startedAt),
    },
  };
}

function updatePendingDurations(event: EventLogEvent | undefined): void {
  if (!event?.provider) return;
  if (event.kind === 'send') {
    pendingProviderSendAt.set(event.provider, event.ts);
    return;
  }
  if ((event.kind === 'response' || event.kind === 'response-error') && event.detail?.action === 'RESPONSE_DONE') {
    pendingProviderSendAt.delete(event.provider);
  }
}
