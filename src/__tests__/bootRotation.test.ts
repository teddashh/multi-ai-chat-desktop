import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage, ProviderState } from '../../shared/types';
import { AI_PROVIDERS } from '../../shared/constants';
import { onBridgeMessage, publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import { handleTitleMessage, onProviderBootRotation, resetBridgePullForTests, resetProviderBootState } from '../bridge/pull';
import { host } from '../host';
import { formatI18n, t } from '../i18n/t';
import type { Locale } from '../i18n/resolve';
import { StepTimeoutDialog } from '../ui/StepTimeoutDialog';
import { nextStepTimeoutState } from '../ui/stepTimeoutState';
import { resetCancelState } from '../workflow/cancel';
import { isRetryableSendRejection, ProviderPageReloadedError, ProviderResponseError } from '../workflow/providerResponse';
import { resetSessionCheckpointForTests } from '../workflow/sessionCheckpoint';
import { runStep } from '../workflow/stepRunner';
import { chooseStepTimeoutAction, onStepTimeoutEvent, resetStepTimeoutForTests, type StepTimeoutEvent } from '../workflow/stepTimeout';
import { SKIP_RESPONSE, resetWorkflowStateForTests } from '../workflow/state';
import { hasWaiter, resetWaitForResponseForTests, STEP_TIMEOUT_MS, waitForResponse } from '../workflow/waitForResponse';
import { resetWorkflowRuntimeForTests, runWorkflow } from '../workflow';

vi.mock('../host', () => ({
  host: {
    provider: {
      send: vi.fn(),
      fill: vi.fn(),
      eval: vi.fn(),
      evalWithCallback: vi.fn(),
      stop: vi.fn(() => Promise.resolve()),
    },
    connections: {
      get: vi.fn(),
    },
    bridge: {
      subscribeTitle: vi.fn(),
    },
    sessionCheckpoint: {
      save: vi.fn(),
      load: vi.fn(),
      clear: vi.fn(),
    },
  },
}));

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok', 'meta'];

function state(provider: AIProvider): ProviderState {
  return {
    provider,
    webview: 'loaded',
    dom: 'ready',
    login: 'logged_in',
    thinking: false,
    lastStatusAt: 1,
  };
}

function title(provider: AIProvider, bootId: string, seq: number, payload?: unknown): BridgeMessage {
  return { v: 1, action: 'STATUS_REPORT', provider, bootId, seq, payload, transport: 'title' };
}

function done(provider: AIProvider, payload: string): BridgeMessage {
  return { v: 1, action: 'RESPONSE_DONE', provider, payload, transport: 'pull' };
}

describe('provider boot rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSessionCheckpointForTests();
    vi.mocked(host.provider.send).mockResolvedValue(undefined);
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([]));
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));
    vi.mocked(host.sessionCheckpoint.save).mockResolvedValue(undefined);
    vi.mocked(host.sessionCheckpoint.clear).mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetBusForTests();
    resetBridgePullForTests();
    resetWorkflowStateForTests();
    resetWaitForResponseForTests();
    resetWorkflowRuntimeForTests();
    resetCancelState();
    resetStepTimeoutForTests();
    resetSessionCheckpointForTests();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('rejects a waiter promptly when its provider boot rotates, without waiting out the step timeout', async () => {
    handleTitleMessage(title('meta', 'boot-a', 1));
    const promise = waitForResponse('meta', 1);
    const rejection = promise.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS - 1_000);
    await expect(Promise.race([rejection.then(() => 'settled'), Promise.resolve('pending')])).resolves.toBe('pending');

    handleTitleMessage(title('meta', 'boot-b', 1, { thinking: true }));
    const error = await rejection;

    expect(error).toBeInstanceOf(ProviderPageReloadedError);
    expect(error).toBeInstanceOf(ProviderResponseError);
    expect(error).toMatchObject({
      provider: 'meta',
      message: 'provider page reloaded during its turn',
      response: '[Error: provider page reloaded during its turn]',
    });
    expect(isRetryableSendRejection(error as ProviderPageReloadedError)).toBe(false);
    expect((error as Error).message).not.toMatch(/timed out/);
    expect(hasWaiter('meta', 1)).toBe(false);

    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);
    await expect(rejection).resolves.toBe(error);
    expect(hasWaiter('meta', 1)).toBe(false);
  });

  it('does not reject a waiter on the first boot the host sees for that provider', async () => {
    const rotations = vi.fn();
    const unsubscribe = onProviderBootRotation(rotations);
    let settled = false;
    const promise = waitForResponse('meta', 2).then(
      (response) => {
        settled = true;
        return response;
      },
      (error: unknown) => {
        settled = true;
        throw error;
      },
    );

    handleTitleMessage(title('meta', 'boot-a', 1));
    handleTitleMessage(title('meta', 'boot-a', 2, { thinking: true }));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(rotations).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    expect(hasWaiter('meta', 2)).toBe(true);

    publishBridgeMessage(done('meta', 'still waiting on the first boot'));
    await expect(promise).resolves.toBe('still waiting on the first boot');
    unsubscribe();
  });

  it('does not disturb a waiter on another provider when one provider rotates', async () => {
    handleTitleMessage(title('meta', 'boot-a', 1));
    handleTitleMessage(title('chatgpt', 'boot-a', 1));
    const meta = waitForResponse('meta', 1);
    const chatgpt = waitForResponse('chatgpt', 1);
    const metaError = meta.catch((error: unknown) => error);

    handleTitleMessage(title('meta', 'boot-b', 1));
    await expect(metaError).resolves.toBeInstanceOf(ProviderPageReloadedError);
    expect(hasWaiter('meta', 1)).toBe(false);
    expect(hasWaiter('chatgpt', 1)).toBe(true);

    publishBridgeMessage(done('chatgpt', 'chatgpt kept its turn'));
    await expect(chatgpt).resolves.toBe('chatgpt kept its turn');
  });

  it('rejects an in-flight waiter when reload replaces the document after boot reset, and does not re-arm it', async () => {
    handleTitleMessage(title('meta', 'boot-a', 1));
    const promise = waitForResponse('meta', 4);
    const rejection = promise.catch((error: unknown) => error);

    resetProviderBootState('meta');
    expect(hasWaiter('meta', 4)).toBe(true);

    handleTitleMessage(title('meta', 'boot-b', 1));
    const error = await rejection;
    expect(error).toBeInstanceOf(ProviderPageReloadedError);
    expect(hasWaiter('meta', 4)).toBe(false);

    handleTitleMessage(title('meta', 'boot-b', 2, { thinking: true }));
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);

    expect(hasWaiter('meta', 4)).toBe(false);
    await expect(rejection).resolves.toBe(error);
    expect((error as Error).message).toBe('provider page reloaded during its turn');
  });

  it('does not let a later thinking status re-arm a waiter rejected by boot rotation', async () => {
    handleTitleMessage(title('meta', 'boot-a', 1));
    const promise = waitForResponse('meta', 3);
    const rejection = promise.catch((error: unknown) => error);

    handleTitleMessage(title('meta', 'boot-b', 1));
    const error = await rejection;
    expect(error).toBeInstanceOf(ProviderPageReloadedError);

    handleTitleMessage(title('meta', 'boot-b', 2, { thinking: true }));
    publishBridgeMessage({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'meta',
      payload: { thinking: true },
      transport: 'title',
    });
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);

    expect(hasWaiter('meta', 3)).toBe(false);
    await expect(rejection).resolves.toBe(error);
    expect((error as Error).message).toBe('provider page reloaded during its turn');
  });

  it('stops a structured step terminally and lets Brainstorm recover through the provider-error dialog', async () => {
    const events: StepTimeoutEvent[] = [];
    const unsubscribe = onStepTimeoutEvent((event) => events.push(event));
    const prompt = 'UNIQUE_PROMPT_TOKEN must not flow downstream';

    const terminal = runStep('meta', prompt);
    const terminalError = terminal.catch((error: unknown) => error);
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    handleTitleMessage(title('meta', 'boot-a', 1));
    handleTitleMessage(title('meta', 'boot-b', 1));
    await expect(terminalError).resolves.toBeInstanceOf(ProviderPageReloadedError);
    expect(events.some((event) => event.timedOut)).toBe(false);
    expect(host.provider.send).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(host.provider.send).mock.calls[0]?.[1])).not.toContain('provider page reloaded');

    vi.mocked(host.provider.send).mockClear();
    const recoverable = runStep('meta', prompt, undefined, { recoverProviderErrors: true });
    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    handleTitleMessage(title('meta', 'boot-c', 1));
    handleTitleMessage(title('meta', 'boot-d', 1));
    await vi.waitFor(() => expect(events.some((event) => event.timedOut)).toBe(true));

    const dialogEvent = events.find((event) => event.timedOut);
    expect(dialogEvent).toMatchObject({
      provider: 'meta',
      failureKind: 'provider-error',
      recoveryDetail: 'provider-page-reloaded',
    });
    if (!dialogEvent) throw new Error('missing provider-error dialog event');
    expect(nextStepTimeoutState(undefined, dialogEvent)).toMatchObject({
      failureKind: 'provider-error',
      recoveryDetail: 'provider-page-reloaded',
    });

    chooseStepTimeoutAction('skip');
    await expect(recoverable).resolves.toEqual({ response: SKIP_RESPONSE, turn: -1 });
    expect(host.provider.send).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('reports the localized reload message when a structured workflow stops', async () => {
    const messages: BridgeMessage[] = [];
    const unsubscribe = onBridgeMessage((message) => messages.push(message));
    const run = runWorkflow({ text: 'UNIQUE_PROMPT_TOKEN round question', mode: 'debate', locale: 'de' });

    await vi.waitFor(() => expect(host.provider.send).toHaveBeenCalledTimes(1));
    const provider = vi.mocked(host.provider.send).mock.calls[0]?.[0] as AIProvider;
    handleTitleMessage(title(provider, 'boot-a', 1));
    handleTitleMessage(title(provider, 'boot-b', 1, { thinking: true }));

    await expect(run).resolves.toEqual({ ok: true });
    unsubscribe();

    expect(host.provider.send).toHaveBeenCalledTimes(1);
    const expected = `Error: ${formatI18n(t('workflow.providerPageReloaded', 'de'), {
      provider: AI_PROVIDERS[provider].name,
    })}`;
    const system = messages.find((message) => message.payload === expected);
    expect(system).toMatchObject({
      action: 'RESPONSE_DONE',
      transport: 'local',
      payload: expected,
    });
    expect(String(system?.payload)).not.toContain('UNIQUE_PROMPT_TOKEN');
    expect(String(system?.payload)).not.toContain('[Error:');
    expect(vi.mocked(host.provider.send).mock.calls.some((call) => String(call[1]).includes('provider page reloaded'))).toBe(false);
  });

  it.each([
    ['en', "Meta AI's page reloaded during its turn, so this answer was lost. Retry that step."],
    ['zh-TW', 'Meta AI 的頁面在輪到它時重新載入，這次的回答已遺失。請重試這個步驟。'],
    ['ja', 'Meta AI のページが自分の番の途中で再読み込みされたため、この回答は失われました。このステップを再試行してください。'],
    ['de', 'Die Seite von Meta AI wurde während dieses Schritts neu geladen, daher ist diese Antwort verloren. Wiederholen Sie diesen Schritt.'],
  ] as const)('shows the reload explanation in the recovery dialog for %s', (locale: Locale, description: string) => {
    const html = renderToStaticMarkup(
      createElement(StepTimeoutDialog, {
        event: {
          provider: 'meta',
          remainingMs: 0,
          timedOut: true,
          failureKind: 'provider-error',
          recoveryDetail: 'provider-page-reloaded',
        },
        onClose: vi.fn(),
        locale,
      }),
    );

    expect(html).toContain(t('stepTimeout.providerErrorTitle', locale));
    expect(html.replace(/&#x27;/g, "'")).toContain(description);
    expect(html).toContain(t('stepTimeout.retry', locale));
    expect(html).not.toContain('provider page reloaded during its turn');
    expect(html).not.toContain('UNIQUE_PROMPT_TOKEN');
  });
});
