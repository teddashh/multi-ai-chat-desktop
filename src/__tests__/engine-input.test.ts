import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage } from '../../shared/types';

const PRE_SEND_DELAY_MS = 800;
const SEND_BUTTON_SELECTOR_TIMEOUT_MS = 800;
const SEND_RETRY_DELAY_MS = 1500;
const SEND_FINAL_VERIFY_DELAY_MS = 1500;

type InputStrategyName = 'default' | 'prosemirror-paste' | 'quill-angular';
type SendStrategy = 'click' | 'enter';
type TestDetector = string | { selector: string; textIncludes?: string; textExcludes?: string };

interface TestAdapter {
  provider: AIProvider;
  adapterVersion: number;
  inputSelectors: string[];
  sendButtonSelectors: string[];
  responseSelectors: string[];
  loginDetectors: string[];
  loggedOutDetectors?: TestDetector[];
  thinkingDetectors?: TestDetector[];
  inputStrategy: InputStrategyName;
  sendStrategy?: SendStrategy;
  timing: {
    doneDelayMs: number;
    chunkDebounceMs: number;
    statusIntervalMs: number;
    backupPollMs: number;
  };
}

interface FakeDomEnv {
  document: FakeDocument;
  emitted: BridgeMessage[];
  handlers: Array<(message: BridgeMessage) => void>;
  input: FakeElement;
  sendButton: FakeElement | null;
  responses: FakeElement[];
  detectorElements: Map<string, FakeElement[]>;
  thinking: boolean;
  cloudflareChallenge: boolean;
}

describe('injected engine input hardening', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('reports a Grok challenge before a stale composer can claim logged-in', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    env.cloudflareChallenge = true;
    const handler = await installEngine(env);

    dispatchAdapter(handler);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { dom: 'ready', login: 'blocked', thinking: false, bootId: 'boot1' },
    });
  });

  it('refuses SEND_MESSAGE without mutating the challenge document', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);
    env.cloudflareChallenge = true;

    send(handler, 'must not land');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_RETRY_DELAY_MS);

    expect(env.input.textContent).toBe('');
    expect(env.sendButton?.clickCount).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)?.payload).toBe('[Error: grok security challenge is active]');
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { dom: 'ready', login: 'blocked', thinking: false, bootId: 'boot1' },
    });
  });

  it('emits one challenge error for two queued SEND_MESSAGE commands', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);
    env.cloudflareChallenge = true;

    send(handler, 'first queued send');
    send(handler, 'second queued send');
    await flushMicrotasks();

    expect(
      env.emitted.filter(
        (message) => message.action === 'RESPONSE_DONE' && message.payload === '[Error: grok security challenge is active]',
      ),
    ).toHaveLength(1);
    expect(env.input.textContent).toBe('');
  });

  it('rejects an overlapping SEND_MESSAGE while the first send is being staged', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'first queued send');
    send(handler, 'second queued send');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('first queued send');
    expect(env.sendButton?.clickCount).toBe(1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);
  });

  it('serializes same-tick SEND_MESSAGE and FILL_DRAFT staging', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'send wins');
    fill(handler, 'fill must wait');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('send wins');
    expect(env.sendButton?.clickCount).toBe(1);
  });

  it('serializes same-tick FILL_DRAFT and SEND_MESSAGE staging', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    fill(handler, 'fill wins');
    send(handler, 'send must wait');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('fill wins');
    expect(env.sendButton?.clickCount).toBe(0);
  });

  it('refuses FILL_DRAFT without mutation or an unsolicited error DONE', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);
    env.cloudflareChallenge = true;

    fill(handler, 'must not land');
    await flushMicrotasks();

    expect(env.input.textContent).toBe('');
    expect(env.sendButton?.clickCount).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('does not click or press Enter when a challenge appears during the pre-send delay', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'staged before challenge');
    await flushMicrotasks();
    expect(env.input.textContent).toBe('staged before challenge');

    env.cloudflareChallenge = true;
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)?.payload).toBe('[Error: grok security challenge is active]');
  });

  it('stops async input fallbacks when a challenge appears at a strategy yield', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    env.input.onDispatch = (event) => {
      if (event.type === 'paste') {
        void Promise.resolve().then(() => {
          env.cloudflareChallenge = true;
        });
      }
    };
    const handler = await installEngine(env);
    dispatchAdapter(handler, { inputStrategy: 'prosemirror-paste' });

    send(handler, 'must not reach a fallback');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(env.input.textContent).toBe('');
    expect(env.sendButton?.clickCount).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);
    expect(
      env.emitted.filter(
        (message) => message.action === 'RESPONSE_DONE' && message.payload === '[Error: grok security challenge is active]',
      ),
    ).toHaveLength(1);
  });

  it('releases a FILL_DRAFT response wait when a challenge appears at a strategy yield', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    env.input.onDispatch = (event) => {
      if (event.type === 'paste') {
        void Promise.resolve().then(() => {
          env.cloudflareChallenge = true;
        });
      }
    };
    const handler = await installEngine(env);
    dispatchAdapter(handler, { inputStrategy: 'prosemirror-paste' });

    fill(handler, 'blocked fill');
    await flushMicrotasks();
    await flushMicrotasks();
    env.cloudflareChallenge = false;
    env.input.onDispatch = undefined;

    send(handler, 'later send');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('later send');
    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('reports ChatGPT logged out when login controls and a stale composer coexist', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    env.detectorElements.set('[data-testid="login-button"]', [new FakeElement(env.document, 'button', 'Log in')]);
    const handler = await installEngine(env);

    dispatchAdapter(handler, {
      provider: 'chatgpt',
      loggedOutDetectors: ['[data-testid="login-button"]'],
    });

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { dom: 'ready', login: 'logged_out', thinking: false, bootId: 'boot1' },
    });
  });

  it('reports localized Grok login buttons before a stale composer', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    env.detectorElements.set('button', [new FakeElement(env.document, 'button', '請先登入')]);
    const handler = await installEngine(env);

    dispatchAdapter(handler, {
      loggedOutDetectors: [{ selector: 'button', textIncludes: '登入' }],
    });

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { dom: 'ready', login: 'logged_out', thinking: false, bootId: 'boot1' },
    });
  });

  it('reports the Gemini Google sorry page as blocked', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    vi.stubGlobal('location', {
      href: 'https://www.google.com/sorry/index?continue=https%3A%2F%2Fgemini.google.com%2Fapp',
      hostname: 'www.google.com',
      pathname: '/sorry/index',
    });

    dispatchAdapter(handler, { provider: 'gemini', loginDetectors: [], loggedOutDetectors: [] });

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'gemini',
      payload: { dom: 'ready', login: 'blocked', thinking: false, bootId: 'boot1' },
    });
  });

  it('retryLookup polls until a lookup succeeds', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { retryLookup } = await import('../../injected/engine');
    let attempts = 0;

    const result = retryLookup(
      () => {
        attempts += 1;
        return attempts === 3 ? 'ready' : null;
      },
      { intervalMs: 10, timeoutMs: 50 },
    );

    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toBe('ready');
    expect(attempts).toBe(3);
  });

  it('retryLookup returns null after the bounded timeout', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { retryLookup } = await import('../../injected/engine');
    let attempts = 0;

    const result = retryLookup(
      () => {
        attempts += 1;
        return null;
      },
      { intervalMs: 10, timeoutMs: 25 },
    );

    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toBeNull();
    expect(attempts).toBeGreaterThan(1);
  });

  it('recognizes a rendered copy of the pending prompt without hiding a substantive answer', async () => {
    vi.resetModules();
    const { isLikelyPromptEcho } = await import('../../injected/engine');

    expect(
      isLikelyPromptEcho(
        '請比較 A 與 B。\n\n完整內容',
        '請比較 **A** 與 `B`。\n\n---\n\n完整內容',
      ),
    ).toBe(true);
    expect(isLikelyPromptEcho('你好', '你好')).toBe(true);
    expect(isLikelyPromptEcho('結論：A 較適合，原因是成本較低。', '請比較 A 與 B。')).toBe(false);
  });

  it('lets assertInputLanded pass when the injected text is visible', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('hello');
    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('routes assertInputLanded failure through error-as-DONE', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    env.document.execCommandResult = true;
    env.document.execCommandMutates = false;
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await flushMicrotasks();

    expect(errorDone(env)?.payload).toBe('[Error: grok input injection failed: default left editor empty after injection]');
    expect(env.sendButton?.clickCount).toBe(0);
  });

  it('routes execCommand injection failure through error-as-DONE', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    env.document.execCommandResult = false;
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await flushMicrotasks();

    expect(errorDone(env)?.payload).toBe('[Error: grok input injection failed: execCommand insertText returned false]');
  });

  it('keeps the original pre-send budget while async strategies finish', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, { inputStrategy: 'quill-angular' });

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS - 1);
    expect(env.sendButton?.clickCount).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(env.sendButton?.clickCount).toBe(1);
  });

  it('uses the ProseMirror paste result once without duplicating the prompt', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    env.input.onDispatch = (event) => {
      if (event.type === 'paste') {
        const clipboardEvent = event as unknown as FakeClipboardEvent;
        env.input.setVisibleText(`${env.input.textContent}${clipboardEvent.clipboardData?.getData('text/plain') ?? ''}`);
      }
    };
    const handler = await installEngine(env);
    dispatchAdapter(handler, { inputStrategy: 'prosemirror-paste' });

    send(handler, 'one prompt');
    await flushMicrotasks();

    expect(env.input.textContent).toBe('one prompt');
  });

  it('falls back to one direct ProseMirror draft when synthetic paste is ignored', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, { inputStrategy: 'prosemirror-paste' });

    send(handler, 'fallback prompt');
    await flushMicrotasks();

    expect(env.input.textContent).toBe('fallback prompt');
  });

  it('replaces mismatched stale editor text before sending with the ProseMirror strategy', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'contenteditable' });
    env.input.setVisibleText('stale editor draft');
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt', inputStrategy: 'prosemirror-paste' });

    send(handler, 'fresh ChatGPT prompt', 'chatgpt');
    await flushMicrotasks();

    expect(env.input.textContent).toBe('fresh ChatGPT prompt');
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);
  });

  it('falls back from a missing send button to one Enter target on the shortened budget', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea', sendButton: null });
    const activeChild = new FakeElement(env.document, 'span');
    env.input.focusTarget = activeChild;
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS - 1);
    expect(keyEventCount(activeChild)).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(keyEventCount(activeChild)).toBe(3);
    expect(keyEventCount(env.input)).toBe(0);
  });

  it('tries the input Enter target only if the active target dispatch fails', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea', sendButton: null });
    const activeChild = new FakeElement(env.document, 'span');
    activeChild.dispatchThrowTypes.add('keydown');
    env.input.focusTarget = activeChild;
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS);

    expect(keyEventCount(activeChild)).toBe(1);
    expect(keyEventCount(env.input)).toBe(3);
  });

  it('keeps waiting when ChatGPT consumes the final Enter fallback and starts sending', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    let sendStarted = false;
    env.input.dispatchReturn = false;
    env.input.onDispatch = (event) => {
      if (event.type !== 'keydown' || sendStarted) return;
      sendStarted = true;
      env.input.setVisibleText('');
      env.responses = [new FakeElement(env.document, 'div', 'answer started')];
    };
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'long ChatGPT prompt', 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_RETRY_DELAY_MS + SEND_FINAL_VERIFY_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(2);
    expect(keyEventCount(env.input)).toBe(3);
    expect(env.input.textContent).toBe('');
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(SEND_FINAL_VERIFY_DELAY_MS);
    expect(errorDone(env)).toBeUndefined();
  });

  it('skips retry when the composer has cleared', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    env.input.setVisibleText('');
    await vi.advanceTimersByTimeAsync(SEND_RETRY_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('skips retry when a new response has started', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    env.responses = [new FakeElement(env.document, 'div', 'answer started')];
    await vi.advanceTimersByTimeAsync(SEND_RETRY_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('retries a false-positive click, falls back to Enter, then reports the stuck draft', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    await vi.advanceTimersByTimeAsync(SEND_RETRY_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(2);
    await vi.advanceTimersByTimeAsync(SEND_FINAL_VERIFY_DELAY_MS);
    expect(keyEventCount(env.input)).toBe(3);
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(SEND_FINAL_VERIFY_DELAY_MS);
    expect(errorDone(env)?.payload).toBe('[Error: grok send was not accepted; draft is still in composer]');
  });

  it('does not force Enter or emit error when retry sees a disabled button after a successful click', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    if (env.sendButton) env.sendButton.disabled = true;
    await vi.advanceTimersByTimeAsync(SEND_RETRY_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('surfaces send failure only after the first failed attempt and failed retry', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea', sendButton: null });
    env.input.dispatchThrowTypes.add('keydown');
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS);
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(SEND_RETRY_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS - 1);
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(errorDone(env)?.payload).toBe('[Error: grok send activation failed: enter key dispatch failed]');
  });

  it('emits only one terminal error when a challenge appears during retry lookup', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea', sendButton: null });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(SEND_RETRY_DELAY_MS);
    env.cloudflareChallenge = true;
    await vi.advanceTimersByTimeAsync(SEND_BUTTON_SELECTOR_TIMEOUT_MS);
    await flushMicrotasks();

    expect(
      env.emitted.filter(
        (message) => message.action === 'RESPONSE_DONE' && message.payload === '[Error: grok security challenge is active]',
      ),
    ).toHaveLength(1);
  });

  it('does not let a stale pre-send timer act on a later send operation', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, 'first draft');
    await flushMicrotasks();
    env.responses = [new FakeElement(env.document, 'div', 'first answer')];
    await vi.advanceTimersByTimeAsync(20);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(1);

    send(handler, 'second draft');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('second draft');
    expect(env.sendButton?.clickCount).toBe(1);
  });

  it('does not let a stale delayed finish terminate a later response wait', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      thinkingDetectors: ['.thinking'],
      timing: {
        doneDelayMs: 1_000,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    env.thinking = true;
    send(handler, 'first draft');
    await flushMicrotasks();
    env.responses = [new FakeElement(env.document, 'div', 'first answer')];
    await vi.advanceTimersByTimeAsync(1_010);
    env.thinking = false;
    await vi.advanceTimersByTimeAsync(1_000);

    env.cloudflareChallenge = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(errorDone(env)?.payload).toBe('[Error: grok security challenge is active]');

    env.cloudflareChallenge = false;
    await flushMicrotasks();
    send(handler, 'second draft');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(500);

    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(1);
    expect(env.input.textContent).toBe('second draft');
  });

  it('renews the stability window when text arrives after thinking stops', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      thinkingDetectors: ['.thinking'],
      timing: {
        doneDelayMs: 100,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    env.thinking = true;
    send(handler, 'draft');
    await flushMicrotasks();
    const response = new FakeElement(env.document, 'div', 'partial answer');
    env.responses = [response];
    await vi.advanceTimersByTimeAsync(110);

    env.thinking = false;
    await vi.advanceTimersByTimeAsync(1_000);
    response.textContent = 'complete answer';
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(90);

    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(10);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: 'complete answer',
    });
  });

  it('FILL_DRAFT inserts text without clicking send, dispatching Enter, or scheduling send retry', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    fill(handler, 'draft only');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_RETRY_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS + 1);

    expect(env.input.textContent).toBe('draft only');
    expect(env.sendButton?.clickCount).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('FILL_DRAFT arms response capture for the later native send response', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    fill(handler, 'native draft');
    await flushMicrotasks();
    env.responses = [new FakeElement(env.document, 'div', 'native answer')];
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(env.emitted).toContainEqual({ v: 1, action: 'RESPONSE_CHUNK', provider: 'grok', payload: 'native answer' });
    expect(env.emitted).toContainEqual({ v: 1, action: 'RESPONSE_DONE', provider: 'grok', payload: 'native answer' });
  });

  it('ignores a newly rendered user prompt until the provider answer starts', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });
    const prompt = '請比較 **A** 與 `B`。\n\n---\n\n完整內容';

    send(handler, prompt);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    env.input.setVisibleText('');
    const promptBubble = new FakeElement(env.document, 'div', '請比較 A 與 B。\n\n完整內容');
    env.responses = [promptBubble];
    await vi.advanceTimersByTimeAsync(20);

    expect(env.emitted.some((message) => message.action === 'RESPONSE_CHUNK')).toBe(false);
    expect(env.emitted.some((message) => message.action === 'RESPONSE_DONE')).toBe(false);

    env.responses = [promptBubble, new FakeElement(env.document, 'div', 'A 較適合，原因是成本較低。')];
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_CHUNK',
      provider: 'grok',
      payload: 'A 較適合，原因是成本較低。',
    });
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: 'A 較適合，原因是成本較低。',
    });
    expect(env.emitted.some((message) => message.payload === '請比較 A 與 B。\n\n完整內容')).toBe(false);
  });

  it('captures only the latest response when a provider renders two candidates', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, '請直接回答');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    env.input.setVisibleText('');
    env.responses = [
      new FakeElement(env.document, 'div', '候選回答 A'),
      new FakeElement(env.document, 'div', '候選回答 B'),
    ];
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: '候選回答 B',
    });
    expect(env.emitted.some((message) => String(message.payload).includes('候選回答 A'))).toBe(false);
  });

  it('finishes an image-only response when the provider emits no markdown text', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, 'draw a snowy runner');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    const response = new FakeElement(env.document, 'article');
    const image = new FakeImageElement(env.document, 'snowy runner');
    response.appendChild(image);
    env.responses = [response];
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: '[Image generated: snowy runner]',
    });
  });

  it('finds image media on the assistant root when an empty markdown match follows it', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const oldRoot = new FakeElement(env.document, 'article', 'old response');
    const oldMarkdown = new FakeElement(env.document, 'div', 'old response');
    env.responses = [oldRoot, oldMarkdown];
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, 'draw a snowy runner');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    const responseRoot = new FakeElement(env.document, 'article');
    responseRoot.appendChild(new FakeImageElement(env.document, 'snowy runner'));
    const emptyMarkdown = new FakeElement(env.document, 'div');
    env.responses = [oldRoot, oldMarkdown, responseRoot, emptyMarkdown];
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: '[Image generated: snowy runner]',
    });
  });

  it('waits for image generation to stop before emitting the image-only DONE', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      thinkingDetectors: ['.thinking'],
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, 'draw a snowy runner');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    env.thinking = true;
    const response = new FakeElement(env.document, 'article');
    response.appendChild(new FakeImageElement(env.document, 'snowy runner'));
    env.responses = [response];
    await vi.advanceTimersByTimeAsync(20);

    expect(env.emitted.some((message) => message.action === 'RESPONSE_DONE')).toBe(false);

    env.thinking = false;
    await vi.advanceTimersByTimeAsync(1_010);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: '[Image generated: snowy runner]',
    });
  });

  it('FILL_DRAFT with no adapter emits adapter-not-installed DONE', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);

    fill(handler, 'draft before adapter');
    await flushMicrotasks();

    expect(errorDone(env)?.payload).toBe('[Error: adapter not installed]');
    expect(env.input.textContent).toBe('');
    expect(env.sendButton?.clickCount).toBe(0);
  });

  it('FILL_DRAFT while a send is in flight is ignored without disturbing the active response wait', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, 'sent draft');
    await flushMicrotasks();
    fill(handler, 'ignored draft');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    env.responses = [new FakeElement(env.document, 'div', 'sent response')];
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(env.input.textContent).toBe('sent draft');
    expect(env.sendButton?.clickCount).toBe(1);
    expect(env.emitted).toContainEqual({ v: 1, action: 'RESPONSE_DONE', provider: 'grok', payload: 'sent response' });
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(1);
  });

  it('collects text that lands after the last cached chunk instead of sending a half answer', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      thinkingDetectors: ['.thinking'],
      timing: {
        doneDelayMs: 100,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 1_000,
      },
    });

    env.thinking = true;
    send(handler, 'ask something');
    await flushMicrotasks();
    env.responses = [new FakeElement(env.document, 'div', 'opening line')];
    await vi.advanceTimersByTimeAsync(1_000);

    // 最後一批 render 落地，但「生成中」訊號同時消失。快取還停在 opening line，
    // 下一次 backup poll 要 1000ms 後才到，收尾計時器只剩 100ms——收尾若送快取就少一截。
    env.responses = [new FakeElement(env.document, 'div', 'opening line and everything after it')];
    env.thinking = false;
    await vi.advanceTimersByTimeAsync(100);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: 'opening line and everything after it',
    });
  });
});

function createEnv(options: { inputKind: 'textarea' | 'contenteditable'; sendButton?: FakeElement | null }): FakeDomEnv {
  const document = new FakeDocument();
  const input =
    options.inputKind === 'textarea'
      ? new FakeTextAreaElement(document, 'textarea')
      : new FakeElement(document, 'div');
  const env: FakeDomEnv = {
    document,
    emitted: [],
    handlers: [],
    input,
    sendButton: options.sendButton === undefined ? new FakeElement(document, 'button') : options.sendButton,
    responses: [],
    detectorElements: new Map(),
    thinking: false,
    cloudflareChallenge: false,
  };
  document.env = env;
  return env;
}

async function installEngine(env: FakeDomEnv): Promise<(message: BridgeMessage) => void> {
  vi.resetModules();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  installEngineGlobals(env);
  await import('../../injected/engine');
  const handler = env.handlers[0];
  if (!handler) throw new Error('engine did not register a dispatch handler');
  return handler;
}

function dispatchAdapter(handler: (message: BridgeMessage) => void, overrides: Partial<TestAdapter> = {}) {
  const adapter: TestAdapter = {
    provider: 'grok',
    adapterVersion: 1,
    inputSelectors: ['#editor'],
    sendButtonSelectors: ['button.send'],
    responseSelectors: ['.response'],
    loginDetectors: ['#editor'],
    inputStrategy: 'default',
    sendStrategy: 'click',
    timing: {
      doneDelayMs: 1_000_000,
      chunkDebounceMs: 1_000_000,
      statusIntervalMs: 1_000_000,
      backupPollMs: 1_000_000,
    },
    ...overrides,
  };
  handler({ v: 1, action: 'ADAPTER_UPDATE', payload: adapter } as BridgeMessage);
}

function send(handler: (message: BridgeMessage) => void, text: string, provider: AIProvider = 'grok') {
  handler({ v: 1, action: 'SEND_MESSAGE', provider, payload: { text } });
}

function fill(handler: (message: BridgeMessage) => void, text: string) {
  handler({ v: 1, action: 'FILL_DRAFT', provider: 'grok', payload: { text } });
}

function errorDone(env: FakeDomEnv): BridgeMessage | undefined {
  return env.emitted.find((message) => message.action === 'RESPONSE_DONE' && String(message.payload).startsWith('[Error:'));
}

function keyEventCount(el: FakeElement): number {
  return el.events.filter((eventType) => eventType.startsWith('key')).length;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeElement {
  textContent: string;
  disabled = false;
  dispatchReturn = true;
  clickThrows = false;
  clickCount = 0;
  focusTarget?: FakeElement;
  onClick?: () => void;
  onDispatch?: (event: Event) => void;
  readonly events: string[] = [];
  readonly dispatchThrowTypes = new Set<string>();
  readonly children: FakeElement[] = [];
  private parent: FakeElement | null = null;
  private readonly attrs = new Map<string, string>();

  constructor(
    private readonly fakeDocument: FakeDocument,
    readonly tagName: string,
    text = '',
  ) {
    this.textContent = text;
  }

  focus() {
    this.fakeDocument.activeElement = (this.focusTarget ?? this) as unknown as Element;
  }

  click() {
    this.clickCount += 1;
    if (this.clickThrows) throw new Error('click failed');
    this.onClick?.();
  }

  dispatchEvent(event: Event): boolean {
    this.events.push(event.type);
    if (this.dispatchThrowTypes.has(event.type)) throw new Error('dispatch failed');
    this.onDispatch?.(event);
    return this.dispatchReturn;
  }

  appendChild(child: FakeElement | FakeFragment): FakeElement | FakeFragment {
    if (child instanceof FakeFragment) {
      for (const fragmentChild of child.children) {
        this.appendChild(fragmentChild);
      }
      return child;
    }
    child.parent = this;
    this.children.push(child);
    this.recomputeText();
    return child;
  }

  replaceChildren() {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children.splice(0);
    this.textContent = '';
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== 'p') return [];
    return this.children.filter((child) => child.tagName === 'p');
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === 'img, canvas, video') {
      return this.children.find((child) => ['img', 'canvas', 'video'].includes(child.tagName)) ?? null;
    }
    return null;
  }

  remove() {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent.recomputeText();
    this.parent = null;
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  setVisibleText(text: string) {
    this.textContent = text;
  }

  private recomputeText() {
    this.textContent = this.children.map((child) => child.textContent).join('');
  }
}

class FakeTextAreaElement extends FakeElement {
  private currentValue = '';

  get value(): string {
    return this.currentValue;
  }

  set value(next: string) {
    this.currentValue = next;
    this.textContent = next;
  }

  override setVisibleText(text: string) {
    this.value = text;
  }
}

class FakeImageElement extends FakeElement {
  constructor(fakeDocument: FakeDocument, readonly alt: string) {
    super(fakeDocument, 'img');
  }
}

class FakeFragment {
  readonly children: FakeElement[] = [];

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

class FakeDocument {
  env?: FakeDomEnv;
  activeElement: Element | null = null;
  readonly body = new FakeElement(this, 'body');
  execCommandResult = false;
  execCommandMutates = false;

  querySelector(selector: string): Element | null {
    if (selector.includes('#challenge-running') && this.requireEnv().cloudflareChallenge) {
      return this.body as unknown as Element;
    }
    if (selector === '#editor') return this.requireEnv().input as unknown as Element;
    if (selector === 'button.send') return this.requireEnv().sendButton as unknown as Element | null;
    if (selector === '.thinking' && this.requireEnv().thinking) return this.body as unknown as Element;
    const detector = this.requireEnv().detectorElements.get(selector)?.[0];
    if (detector) return detector as unknown as Element;
    return null;
  }

  querySelectorAll(selector: string): Element[] {
    const selectors = selector.split(',').map((part) => part.trim());
    if (selectors.includes('.response')) return this.requireEnv().responses as unknown as Element[];
    if (selectors.includes('#editor')) return [this.requireEnv().input as unknown as Element];
    if (selectors.includes('button.send') && this.requireEnv().sendButton) {
      return [this.requireEnv().sendButton as unknown as Element];
    }
    const detectorMatches = this.requireEnv().detectorElements.get(selector);
    if (detectorMatches) return detectorMatches as unknown as Element[];
    return [];
  }

  createRange() {
    return {
      selectNodeContents(_el: Element) {
        // no-op for fake selection
      },
    };
  }

  createTreeWalker(_root: FakeElement, _whatToShow: number) {
    return {
      nextNode() {
        return null;
      },
    };
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  createDocumentFragment(): FakeFragment {
    return new FakeFragment();
  }

  execCommand(command: string, _showUi?: boolean, value?: string): boolean {
    if (this.execCommandMutates && command === 'insertText' && this.activeElement instanceof FakeElement) {
      this.activeElement.setVisibleText(value ?? '');
    }
    return this.execCommandResult;
  }

  addEventListener(_type: string, _listener: EventListener, _options?: AddEventListenerOptions) {
    // no-op
  }

  removeEventListener(_type: string, _listener: EventListener) {
    // no-op
  }

  private requireEnv(): FakeDomEnv {
    if (!this.env) throw new Error('fake document env not attached');
    return this.env;
  }
}

function installEngineGlobals(env: FakeDomEnv) {
  const fakeWindow: {
    self?: unknown;
    top?: unknown;
    __MAC_BRIDGE__: {
      bootId: string;
      emit: (message: unknown) => void;
      onDispatch: (handler: (message: BridgeMessage) => void) => void;
    };
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    getSelection: () => { removeAllRanges: () => void; addRange: (_range: unknown) => void };
    HTMLTextAreaElement: typeof FakeTextAreaElement;
  } = {
    __MAC_BRIDGE__: {
      bootId: 'boot1',
      emit: (message: unknown) => env.emitted.push(message as BridgeMessage),
      onDispatch: (handler: (message: BridgeMessage) => void) => env.handlers.push(handler),
    },
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    getSelection: () => ({
      removeAllRanges() {
        // no-op
      },
      addRange(_range: unknown) {
        // no-op
      },
    }),
    HTMLTextAreaElement: FakeTextAreaElement,
  };
  fakeWindow.self = fakeWindow;
  fakeWindow.top = fakeWindow;

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', env.document);
  vi.stubGlobal('location', { href: 'https://grok.com', hostname: 'grok.com', pathname: '/' });
  vi.stubGlobal('HTMLTextAreaElement', FakeTextAreaElement);
  vi.stubGlobal('HTMLImageElement', FakeImageElement);
  vi.stubGlobal('Event', FakeEvent);
  vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent);
  vi.stubGlobal('InputEvent', FakeInputEvent);
  vi.stubGlobal('ClipboardEvent', FakeClipboardEvent);
  vi.stubGlobal('DataTransfer', FakeDataTransfer);
  vi.stubGlobal('MutationObserver', FakeMutationObserver);
}

class FakeEvent {
  readonly type: string;
  readonly bubbles?: boolean;
  readonly cancelable?: boolean;

  constructor(type: string, init?: EventInit) {
    this.type = type;
    this.bubbles = init?.bubbles;
    this.cancelable = init?.cancelable;
  }
}

class FakeKeyboardEvent extends FakeEvent {
  readonly key?: string;
  readonly code?: string;
  readonly keyCode?: number;
  readonly which?: number;

  constructor(type: string, init?: KeyboardEventInit) {
    super(type, init);
    this.key = init?.key;
    this.code = init?.code;
    this.keyCode = init?.keyCode;
    this.which = init?.which;
  }
}

class FakeInputEvent extends FakeEvent {
  readonly data?: string | null;
  readonly inputType?: string;

  constructor(type: string, init?: InputEventInit) {
    super(type, init);
    this.data = init?.data;
    this.inputType = init?.inputType;
  }
}

class FakeClipboardEvent extends FakeEvent {
  readonly clipboardData?: FakeDataTransfer;

  constructor(type: string, init?: EventInit & { clipboardData?: FakeDataTransfer }) {
    super(type, init);
    this.clipboardData = init?.clipboardData;
  }
}

class FakeDataTransfer {
  private readonly data = new Map<string, string>();

  setData(type: string, value: string) {
    this.data.set(type, value);
  }

  getData(type: string): string {
    return this.data.get(type) ?? '';
  }
}

class FakeMutationObserver {
  constructor(_callback: MutationCallback) {
    // no-op
  }

  observe(_target: Node, _options?: MutationObserverInit) {
    // no-op
  }

  disconnect() {
    // no-op
  }
}
