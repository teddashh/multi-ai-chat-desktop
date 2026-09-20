import { beforeEach, describe, expect, it } from 'vitest';
import type { EventLogEvent } from '../diagnostics/eventLog';
import {
  appendEvent,
  eventFromBridgeMessage,
  eventFromNavBlocked,
  eventFromProviderSend,
  eventFromProviderState,
  eventFromStepTimeout,
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

  it('recognizes and filters Meta AI provider errors without retaining their body', () => {
    const responseText = '[Error: Meta guest session reached a provider gate]';
    const event = eventFromBridgeMessage({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'meta',
      payload: responseText,
      transport: 'pull',
    });

    const events = appendEvent([], event!, { now: () => 234 });
    const filtered = filterEventLogByProvider(events, 'meta');
    const copied = formatEventLogText(filtered);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ provider: 'meta', kind: 'response-error' });
    expect(filtered[0].summary).toBe(`Meta AI response error (${responseText.length} chars)`);
    expect(copied).toContain('[Meta AI]');
    expect(copied).not.toContain(responseText);
    expect(copied).not.toContain('guest session');
  });

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

  it('stores nav-blocked diagnostics as provider and host only', () => {
    const payload = {
      provider: 'chatgpt',
      host: 'auth.openai.com',
    };
    const events = appendEvent(
      [],
      eventFromNavBlocked(payload),
      { now: () => 789 },
    );

    expect({ provider: events[0].provider, ...events[0].detail }).toEqual({
      provider: 'chatgpt',
      host: 'auth.openai.com',
    });
    expect(events[0].kind).toBe('nav-blocked');
    expect(Object.keys(events[0].detail ?? {})).toEqual(['host']);
    expect(events[0].detail).not.toHaveProperty('url');
    expect(events[0].detail).not.toHaveProperty('path');
    expect(events[0].detail).not.toHaveProperty('query');
  });

  it('logs provider errors as provider errors while legacy recovery events remain timeouts', () => {
    const providerError = eventFromStepTimeout({
      provider: 'chatgpt',
      remainingMs: 0,
      timedOut: true,
      failureKind: 'provider-error',
    });
    const legacyTimeout = eventFromStepTimeout({ provider: 'chatgpt', remainingMs: 0, timedOut: true });

    expect(providerError.summary).toBe('ChatGPT workflow step failed with a provider error');
    expect(providerError.summary).not.toContain('timed out');
    expect(providerError.detail).toMatchObject({ failureKind: 'provider-error' });
    expect(providerError.detail).not.toHaveProperty('timedOut');
    expect(legacyTimeout.summary).toBe('ChatGPT workflow step timed out');
    expect(legacyTimeout.detail).toMatchObject({ failureKind: 'timeout', timedOut: true });
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

  it('coalesces repeated provider heartbeats while keeping real state transitions', () => {
    recordEventLog({
      ts: 1,
      provider: 'chatgpt',
      kind: 'provider-state',
      summary: 'ChatGPT state: ready',
      detail: { dom: 'ready', thinking: false, seq: 1, lastStatusAt: 1 },
    });
    recordEventLog({
      ts: 2,
      provider: 'chatgpt',
      kind: 'provider-state',
      summary: 'ChatGPT state: ready',
      detail: { dom: 'ready', thinking: false, seq: 2, lastStatusAt: 2 },
    });
    recordEventLog({
      ts: 3,
      provider: 'chatgpt',
      kind: 'provider-state',
      summary: 'ChatGPT state: thinking',
      detail: { dom: 'ready', thinking: true, seq: 3, lastStatusAt: 3 },
    });
    recordEventLog({
      ts: 4,
      provider: 'chatgpt',
      kind: 'provider-state',
      summary: 'ChatGPT state: ready',
      detail: { dom: 'ready', thinking: false, seq: 4, lastStatusAt: 4 },
    });

    expect(getEventLogSnapshot().map((event) => event.summary)).toEqual([
      'ChatGPT state: ready',
      'ChatGPT state: thinking',
      'ChatGPT state: ready',
    ]);
  });

  it('keeps the host-owned Grok stale reason in sanitized diagnostics', () => {
    const event = eventFromProviderState({
      provider: 'grok',
      webview: 'loaded',
      dom: 'unknown',
      login: 'unknown',
      thinking: false,
      bridge: 'ok',
      bridgeReason: 'grok_app_title_unconfirmed',
      adapter: 'ok',
      lastStatusAt: 1,
    });

    expect(event.detail).toMatchObject({ bridgeReason: 'grok_app_title_unconfirmed' });
  });

  it('coalesces interleaved bridge and connection heartbeats independently', () => {
    const providerState = {
      provider: 'chatgpt' as const,
      webview: 'loaded' as const,
      dom: 'ready' as const,
      login: 'logged_in' as const,
      thinking: false,
      bridge: 'ok' as const,
      adapter: 'ok' as const,
      lastStatusAt: 1,
    };
    const statusReport = (seq: number, thinking = false) =>
      eventFromBridgeMessage({
        v: 1,
        action: 'STATUS_REPORT',
        provider: 'chatgpt',
        bootId: 'boot-1',
        seq,
        payload: { dom: 'ready', login: 'logged_in', thinking },
        transport: 'title',
      });

    recordEventLog(statusReport(1));
    recordEventLog(eventFromProviderState(providerState));
    recordEventLog(statusReport(2));
    recordEventLog(eventFromProviderState({ ...providerState, lastStatusAt: 2 }));

    expect(getEventLogSnapshot()).toHaveLength(2);

    recordEventLog(statusReport(3, true));
    recordEventLog(eventFromProviderState({ ...providerState, thinking: true, lastStatusAt: 3 }));

    expect(getEventLogSnapshot().map((event) => event.summary)).toEqual([
      'ChatGPT status: dom ready, login logged_in, thinking no',
      'ChatGPT state: bridge ok, adapter ok, login logged_in, dom ready, thinking no',
      'ChatGPT status: dom ready, login logged_in, thinking yes',
      'ChatGPT state: bridge ok, adapter ok, login logged_in, dom ready, thinking yes',
    ]);
  });
});
