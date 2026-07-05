import { beforeEach, describe, expect, it } from 'vitest';
import type { EventLogEvent } from '../diagnostics/eventLog';
import {
  appendEvent,
  eventFromBridgeMessage,
  eventFromProviderSend,
  filterEventLogByProvider,
  formatEventLogText,
} from '../diagnostics/eventLog';
import {
  getEventLogSnapshot,
  recordEventLog,
  resetEventLogForTests,
  subscribeEventLog,
} from '../diagnostics/eventLogStore';

describe('event log reducer', () => {
  beforeEach(() => {
    resetEventLogForTests();
  });

  it('enforces a capped ring buffer and keeps the newest events', () => {
    let events: EventLogEvent[] = [];
    for (let i = 0; i < 6; i += 1) {
      events = appendEvent(events, { ts: i, kind: 'workflow-step', summary: `event-${i}` }, { cap: 3 });
    }

    expect(events.map((event) => event.summary)).toEqual(['event-3', 'event-4', 'event-5']);
    expect(events.map((event) => event.ts)).toEqual([3, 4, 5]);
  });

  it('preserves append ordering', () => {
    const events = [
      { ts: 10, kind: 'workflow-step' as const, summary: 'first' },
      { ts: 11, kind: 'workflow-step' as const, summary: 'second' },
      { ts: 12, kind: 'workflow-step' as const, summary: 'third' },
    ].reduce<EventLogEvent[]>((current, event) => appendEvent(current, event), []);

    expect(events.map((event) => event.summary)).toEqual(['first', 'second', 'third']);
  });

  it('stores response length instead of response text', () => {
    const responseText = 'secret final answer body';
    const event = eventFromBridgeMessage({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: responseText,
      transport: 'pull',
    });

    const events = appendEvent([], event!, { now: () => 123 });
    const serialized = JSON.stringify(events);

    expect(events[0].detail).toMatchObject({ chars: responseText.length });
    expect(events[0].summary).toContain(`${responseText.length} chars`);
    expect(serialized).not.toContain(responseText);
  });

  it.each(['Error: cannot read foo', '[Error: secret]'])(
    'does not store error-looking response body text for %s',
    (responseText) => {
      const event = eventFromBridgeMessage({
        v: 1,
        action: 'RESPONSE_DONE',
        provider: 'chatgpt',
        payload: responseText,
        transport: 'pull',
      });

      const events = appendEvent([], event!, { now: () => 123 });
      const serialized = JSON.stringify(events);
      const copied = formatEventLogText(events);

      expect(events[0].kind).toBe('response-error');
      expect(events[0].summary).toBe(`ChatGPT response error (${responseText.length} chars)`);
      expect(events[0].detail).toMatchObject({
        chars: responseText.length,
        truncated: false,
        errorLike: true,
      });
      expect(events[0].detail).not.toHaveProperty('reason');
      expect(serialized).not.toContain(responseText);
      expect(copied).not.toContain(responseText);
      expect(serialized).not.toContain('cannot read foo');
      expect(copied).not.toContain('cannot read foo');
      expect(serialized).not.toContain('secret');
      expect(copied).not.toContain('secret');
    },
  );

  it('stores prompt length instead of prompt text', () => {
    const prompt = 'private user prompt';
    const events = appendEvent([], eventFromProviderSend('claude', prompt), { now: () => 456 });

    expect(events[0].detail).toMatchObject({ promptChars: prompt.length });
    expect(formatEventLogText(events)).not.toContain(prompt);
  });

  it('drops sensitive raw detail fields defensively', () => {
    const events = appendEvent(
      [],
      {
        ts: 1,
        kind: 'response',
        summary: 'safe summary',
        detail: {
          chars: 5,
          text: 'secret text',
          prompt: 'secret prompt',
          body: 'secret body',
        },
      },
      { cap: 10 },
    );

    expect(events[0].detail).toEqual({ chars: 5 });
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('formats only provider-filtered events when copying a filtered log', () => {
    const events = [
      { ts: 1, provider: 'chatgpt' as const, kind: 'provider-state' as const, summary: 'chatgpt-only' },
      { ts: 2, provider: 'claude' as const, kind: 'provider-state' as const, summary: 'claude-only' },
    ].reduce<EventLogEvent[]>((current, event) => appendEvent(current, event), []);

    const copied = formatEventLogText(filterEventLogByProvider(events, 'claude'));

    expect(copied).toContain('claude-only');
    expect(copied).not.toContain('chatgpt-only');
  });

  it('keeps recordEventLog non-throwing and notifies healthy listeners when one listener throws', () => {
    const unsubscribeThrowing = subscribeEventLog(() => {
      throw new Error('listener failed');
    });
    let healthyCalls = 0;
    const unsubscribeHealthy = subscribeEventLog(() => {
      healthyCalls += 1;
    });

    try {
      expect(() => recordEventLog({ kind: 'workflow-step', summary: 'safe event' })).not.toThrow();
      expect(healthyCalls).toBe(1);
      expect(getEventLogSnapshot()).toHaveLength(1);
    } finally {
      unsubscribeThrowing();
      unsubscribeHealthy();
    }
  });
});
