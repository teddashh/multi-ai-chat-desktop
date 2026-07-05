import { useSyncExternalStore } from 'react';
import type { EventLogEvent } from '../diagnostics/eventLog';
import { getEventLogSnapshot, subscribeEventLog } from '../diagnostics/eventLogStore';

export function useEventLog(): readonly EventLogEvent[] {
  return useSyncExternalStore(subscribeEventLog, getEventLogSnapshot, getEventLogSnapshot);
}
