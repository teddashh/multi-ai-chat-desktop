import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage } from '../../shared/types';

const PRE_SEND_DELAY_MS = 800;
const INPUT_SELECTOR_TIMEOUT_MS = 2500;
const SELECTOR_RETRY_INTERVAL_MS = 250;
const SEND_BUTTON_SELECTOR_TIMEOUT_MS = 800;
const SEND_RETRY_DELAY_MS = 1500;
const SEND_FINAL_VERIFY_DELAY_MS = 1500;
const CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS = 10_000;
const CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS = 4_000;
const CHATGPT_COMPOSER_SUBMIT_SELECTOR = 'button[data-testid="composer-submit-button"]';
const CHATGPT_USER_MESSAGE_TESTID_SELECTOR = '[data-testid="user-message"]';
const GROK_CHAT_STOP_BUTTON_SELECTOR = 'button[data-testid="chat-stop-button"]';
const CHATGPT_STOP_BUTTON_SELECTOR = '[data-testid="stop-button"]';
const CHATGPT_TURN_SELECTOR = '[data-testid^="conversation-turn-"]';
const CHATGPT_REASONING_SIDECAR_SELECTOR = '[data-testid*="reasoning"]';
const CHATGPT_COPY_BUTTON_TEST_ID = 'copy-turn-action-button';
const CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS = 400;
const CHATGPT_TERMINAL_STABLE_MS = 1_200;
const LEGACY_GROK_EDITOR_SELECTOR = '.ProseMirror[contenteditable="true"]';
const GROK_TEXTAREA_SELECTORS = [
  '[data-testid="chat-input"] textarea[aria-label="Ask Grok anything"]',
  'textarea[aria-label="Ask Grok anything"]',
  '[data-testid="chat-input"] textarea',
] as const;

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
  stopButtonSelectors?: string[];
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
  userMessages: FakeElement[];
  detectorElements: Map<string, FakeElement[]>;
  thinking: boolean;
  cloudflareChallenge: boolean;
}

function grokAdapterWithoutTextarea(overrides: Partial<TestAdapter> = {}): Partial<TestAdapter> {
  return {
    inputSelectors: [LEGACY_GROK_EDITOR_SELECTOR],
    loginDetectors: [LEGACY_GROK_EDITOR_SELECTOR],
    inputStrategy: 'prosemirror-paste',
    ...overrides,
  };
}

describe('injected engine input hardening', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

  it('reports ChatGPT logged out when the login form and a stale composer coexist', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    env.detectorElements.set('[data-testid="login-form"]', [new FakeElement(env.document, 'form')]);
    const handler = await installEngine(env);

    dispatchAdapter(handler, {
      provider: 'chatgpt',
      loggedOutDetectors: ['[data-testid="login-form"]'],
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

  it.each(GROK_TEXTAREA_SELECTORS)(
    'recognizes a visible current Grok textarea as logged in without adapter selector %s',
    async (selector) => {
      const env = createEnv({ inputKind: 'textarea' });
      env.input.setAttribute('aria-label', 'Ask Grok anything');
      env.detectorElements.set(selector, [env.input]);
      const handler = await installEngine(env);

      dispatchAdapter(handler, grokAdapterWithoutTextarea());

      expect(env.emitted.at(-1)).toEqual({
        v: 1,
        action: 'STATUS_REPORT',
        provider: 'grok',
        payload: { dom: 'ready', login: 'logged_in', thinking: false, bootId: 'boot1' },
      });
    },
  );

  it('ignores a hidden current Grok textarea for login and input injection', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const textarea = env.input as FakeTextAreaElement;
    textarea.hidden = true;
    textarea.setAttribute('aria-label', 'Ask Grok anything');
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [textarea]);
    const handler = await installEngine(env);

    dispatchAdapter(handler, grokAdapterWithoutTextarea());
    expect(env.emitted.at(-1)).toEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { dom: 'ready', login: 'logged_out', thinking: false, bootId: 'boot1' },
    });

    send(handler, 'must not enter a hidden textarea');
    await vi.advanceTimersByTimeAsync(INPUT_SELECTOR_TIMEOUT_MS);
    await flushMicrotasks();

    expect(textarea.value).toBe('');
    expect(textarea.events).not.toContain('input');
    expect(env.sendButton?.clickCount).toBe(0);
    expect(errorDone(env)?.payload).toBe('[Error: grok input element not found]');
  });

  it('ignores a hidden legacy Grok composer as a login detector', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    const hiddenLegacyComposer = new FakeElement(env.document, 'div');
    hiddenLegacyComposer.hidden = true;
    env.detectorElements.set(LEGACY_GROK_EDITOR_SELECTOR, [hiddenLegacyComposer]);
    const handler = await installEngine(env);

    dispatchAdapter(handler, grokAdapterWithoutTextarea());

    expect(env.emitted.at(-1)).toEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { dom: 'ready', login: 'logged_out', thinking: false, bootId: 'boot1' },
    });
  });

  it('ignores and never clicks a hidden legacy Grok stop detector', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    env.input.setAttribute('aria-label', 'Ask Grok anything');
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [env.input]);
    const legacyStopSelector = 'button[data-testid="chat-stop"]';
    const hiddenLegacyStop = new FakeElement(env.document, 'button');
    hiddenLegacyStop.hidden = true;
    env.detectorElements.set(legacyStopSelector, [hiddenLegacyStop]);
    const handler = await installEngine(env);

    dispatchAdapter(
      handler,
      grokAdapterWithoutTextarea({
        thinkingDetectors: [legacyStopSelector],
        stopButtonSelectors: [legacyStopSelector],
      }),
    );

    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { login: 'logged_in', thinking: false },
    });

    const engine = (window as unknown as { __MAC_ENGINE__?: { stop?: () => void } }).__MAC_ENGINE__;
    engine?.stop?.();

    expect(hiddenLegacyStop.clickCount).toBe(0);
  });

  it('keeps Grok logged in while its current textarea transitions to the exact live stop button', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    env.input.setAttribute('aria-label', 'Ask Grok anything');
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [env.input]);
    const handler = await installEngine(env);
    dispatchAdapter(handler, grokAdapterWithoutTextarea());

    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { login: 'logged_in', thinking: false },
    });

    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], []);
    env.detectorElements.set(GROK_CHAT_STOP_BUTTON_SELECTOR, [new FakeElement(env.document, 'button')]);
    handler({ v: 1, action: 'CHECK_STATUS', provider: 'grok' } as BridgeMessage);

    expect(env.emitted.at(-1)).toEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'grok',
      payload: { dom: 'ready', login: 'logged_in', thinking: true, bootId: 'boot1' },
    });
  });

  it('injects an exact Unicode Markdown prompt into the current Grok textarea and clicks SEND once', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const textarea = env.input as FakeTextAreaElement;
    textarea.setAttribute('aria-label', 'Ask Grok anything');
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [textarea]);
    const prompt = '# 深度比較 🚀\n\n請保留 **粗體**、`inline-code` 與「完整標點」。';
    const inputEventValues: string[] = [];
    textarea.onDispatch = (event) => {
      if (event.type === 'input') inputEventValues.push(textarea.value);
    };
    let submitted = '';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        submitted = textarea.value;
        textarea.setVisibleText('');
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, grokAdapterWithoutTextarea());

    send(handler, prompt);
    await flushMicrotasks();

    expect(textarea.value).toBe(prompt);
    expect(inputEventValues).toEqual([prompt]);

    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_RETRY_DELAY_MS + 1);

    expect(submitted).toBe(prompt);
    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('reports Meta AI logged out while its pre-login composer remains inert', async () => {
    const env = createEnv({ inputKind: 'input' });
    const inertComposerSelector = '[inert] input[aria-label="Ask Meta AI"]';
    env.detectorElements.set(inertComposerSelector, [env.input]);
    const handler = await installEngine(env);

    dispatchAdapter(handler, {
      provider: 'meta',
      inputSelectors: ['input[aria-label="Ask Meta AI"]'],
      loginDetectors: ['input[aria-label="Ask Meta AI"]'],
      loggedOutDetectors: [inertComposerSelector, '[data-testid="login-button"]'],
    });

    expect(env.emitted.at(-1)).toEqual({
      v: 1,
      action: 'STATUS_REPORT',
      provider: 'meta',
      payload: { dom: 'ready', login: 'logged_out', thinking: false, bootId: 'boot1' },
    });
  });

  it('injects and verifies Meta AI native input composers before clicking SEND', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'input' });
    const input = env.input as FakeInputElement;
    input.setAttribute('aria-label', 'Ask Meta AI');
    const prompt = '請用 Meta AI 比較 **A** 與 `B`。';
    const inputEventValues: string[] = [];
    input.onDispatch = (event) => {
      if (event.type === 'input') inputEventValues.push(input.value);
    };
    let submitted = '';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        submitted = input.value;
        input.setVisibleText('');
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'meta' });

    send(handler, prompt, 'meta');
    await flushMicrotasks();

    expect(input.value).toBe(prompt);
    expect(inputEventValues).toEqual([prompt]);

    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_RETRY_DELAY_MS + 1);

    expect(submitted).toBe(prompt);
    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('fills the current Grok textarea without clicking SEND', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const textarea = env.input as FakeTextAreaElement;
    textarea.setAttribute('aria-label', 'Ask Grok anything');
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[1], [textarea]);
    const prompt = '草稿：**不要送出** 🧪';
    const inputEventValues: string[] = [];
    textarea.onDispatch = (event) => {
      if (event.type === 'input') inputEventValues.push(textarea.value);
    };
    const handler = await installEngine(env);
    dispatchAdapter(handler, grokAdapterWithoutTextarea());

    fill(handler, prompt);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_RETRY_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS + 1);

    expect(textarea.value).toBe(prompt);
    expect(inputEventValues).toEqual([prompt]);
    expect(env.sendButton?.clickCount).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('restores the exact prompt into a remounted current Grok textarea before activation', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const original = env.input as FakeTextAreaElement;
    original.setAttribute('aria-label', 'Ask Grok anything');
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [original]);
    const prompt = '重新掛載後仍保留 **Markdown** 與 emoji 🌌';
    const handler = await installEngine(env);
    dispatchAdapter(handler, grokAdapterWithoutTextarea());

    send(handler, prompt);
    await flushMicrotasks();
    expect(original.value).toBe(prompt);

    const remounted = new FakeTextAreaElement(env.document, 'textarea');
    remounted.setAttribute('aria-label', 'Ask Grok anything');
    const remountedInputValues: string[] = [];
    remounted.onDispatch = (event) => {
      if (event.type === 'input') remountedInputValues.push(remounted.value);
    };
    env.input = remounted;
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [remounted]);
    let submitted = '';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        submitted = remounted.value;
        remounted.setVisibleText('');
      };
    }

    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_RETRY_DELAY_MS + 1);

    expect(submitted).toBe(prompt);
    expect(remountedInputValues).toEqual([prompt]);
    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('restores the exact Grok prompt when the textarea remounts during send-button lookup', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea', sendButton: null });
    const original = env.input as FakeTextAreaElement;
    original.setAttribute('aria-label', 'Ask Grok anything');
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [original]);
    const prompt = '按鈕等待期間重掛載：**完整保留** 🌠';
    const handler = await installEngine(env);
    dispatchAdapter(handler, grokAdapterWithoutTextarea());

    send(handler, prompt);
    await flushMicrotasks();
    expect(original.value).toBe(prompt);

    // Activation has validated the original textarea and is now waiting for a send button.
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    const remounted = new FakeTextAreaElement(env.document, 'textarea');
    remounted.setAttribute('aria-label', 'Ask Grok anything');
    const remountedInputValues: string[] = [];
    remounted.onDispatch = (event) => {
      if (event.type === 'input') remountedInputValues.push(remounted.value);
    };
    env.input = remounted;
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [remounted]);

    let submitted = '';
    const lateButton = new FakeElement(env.document, 'button');
    lateButton.onClick = () => {
      submitted = remounted.value;
      remounted.setVisibleText('');
    };
    env.sendButton = lateButton;

    await vi.advanceTimersByTimeAsync(SELECTOR_RETRY_INTERVAL_MS);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(SEND_RETRY_DELAY_MS + 1);

    expect(submitted).toBe(prompt);
    expect(remountedInputValues).toEqual([prompt]);
    expect(lateButton.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('uses the newest of two overlapping visible Grok textareas', async () => {
    const env = createEnv({ inputKind: 'textarea' });
    const older = env.input as FakeTextAreaElement;
    older.setAttribute('aria-label', 'Ask Grok anything');
    const newest = new FakeTextAreaElement(env.document, 'textarea');
    newest.setAttribute('aria-label', 'Ask Grok anything');
    env.input = newest;
    env.detectorElements.set(GROK_TEXTAREA_SELECTORS[0], [older, newest]);
    const handler = await installEngine(env);
    dispatchAdapter(handler, grokAdapterWithoutTextarea());

    fill(handler, '只應寫入最新的 composer');
    await flushMicrotasks();

    expect(older.value).toBe('');
    expect(older.events).not.toContain('input');
    expect(newest.value).toBe('只應寫入最新的 composer');
    expect(newest.events).toContain('input');
    expect(env.sendButton?.clickCount).toBe(0);
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

  it('uses the current ChatGPT composer submit control when the frozen adapter selector misses', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea', sendButton: null });
    const liveSubmit = new FakeElement(env.document, 'button');
    env.detectorElements.set(CHATGPT_COMPOSER_SUBMIT_SELECTOR, [liveSubmit]);
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'submit through the current composer control', 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(liveSubmit.clickCount).toBe(1);
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
    const prompt = 'long ChatGPT prompt';
    let sendStarted = false;
    env.input.dispatchReturn = false;
    env.input.onDispatch = (event) => {
      if (event.type !== 'keydown' || sendStarted) return;
      sendStarted = true;
      env.input.setVisibleText('');
      env.userMessages = [new FakeElement(env.document, 'div', prompt)];
      env.responses = [new FakeElement(env.document, 'div', 'answer started')];
    };
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(
      PRE_SEND_DELAY_MS + CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS + CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS,
    );

    expect(env.sendButton?.clickCount).toBe(2);
    expect(keyEventCount(env.input)).toBe(3);
    expect(env.input.textContent).toBe('');
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS);
    expect(errorDone(env)).toBeUndefined();
  });

  it('restores a staged ChatGPT prompt into a composer that remounts before activation', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const originalInput = env.input;
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'prompt survives remount', 'chatgpt');
    await flushMicrotasks();
    const remountedInput = new FakeTextAreaElement(env.document, 'textarea');
    env.input = remountedInput;
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(originalInput.textContent).toBe('prompt survives remount');
    expect(remountedInput.textContent).toBe('prompt survives remount');
    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('fails closed when ChatGPT clears the composer without a matching user turn', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    if (env.sendButton) env.sendButton.onClick = () => env.input.setVisibleText('');
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'unconfirmed prompt', 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + 4_000);

    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS - 4_000);

    expect(env.sendButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)?.payload).toBe(
      '[Error: chatgpt send could not be confirmed; composer cleared before a matching user turn appeared]',
    );
  });

  it('accepts a cleared ChatGPT composer only after the matching user turn appears', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = 'confirmed prompt';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        env.input.setVisibleText('');
        env.userMessages = [new FakeElement(env.document, 'div', prompt)];
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('retries an optimistic ChatGPT user turn while an idle exact draft remains in the composer', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = 'optimistic bubble must not confirm an unconsumed draft';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        if (env.sendButton?.clickCount === 1) {
          env.userMessages = [new FakeElement(env.document, 'div', prompt)];
          return;
        }
        env.input.setVisibleText('');
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);
    expect(env.input.textContent).toBe(prompt);

    await vi.advanceTimersByTimeAsync(CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(2);
    expect(env.input.textContent).toBe('');
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(2);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('never retries an optimistic ChatGPT draft while native generation is visible', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = 'do not interrupt an accepted Astra turn';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        env.userMessages = [new FakeElement(env.document, 'div', prompt)];
        const turn = new FakeElement(env.document, 'article');
        const response = new FakeElement(env.document, 'p', 'Pro thinking');
        turn.appendChild(response);
        env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
        env.responses = [response];
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(1);
    expect(env.input.textContent).toBe(prompt);
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS * 3);
    expect(env.sendButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('accepts a ChatGPT user turn rendered from the Markdown prompt', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = '# Review\nUse **the source** at [Docs](https://example.com/docs).';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        env.input.setVisibleText('');
        env.userMessages = [new FakeElement(env.document, 'div', 'Review\nUse the source at Docs.')];
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('anchors a long ChatGPT handoff whose live user turn is collapsed behind Show more', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = `<response-language-policy version="1">${'Keep the exact long handoff context. '.repeat(80)}</response-language-policy>`;
    const collapsedPrompt = `${prompt.slice(0, 240)}Show more`;
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        env.input.setVisibleText('');
        env.userMessages = [new FakeElement(env.document, 'div', collapsedPrompt)];
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const response = new FakeElement(env.document, 'div', 'answer after the collapsed long handoff');
    turn.appendChild(copyButton);
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    await vi.advanceTimersByTimeAsync(
      CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 100,
    );

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'answer after the collapsed long handoff',
    });
    expect(errorDone(env)).toBeUndefined();
  });

  it('anchors the current ChatGPT user-message testid when the legacy role selector is absent', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = 'anchor the current ChatGPT user turn';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        env.input.setVisibleText('');
        env.detectorElements.set(CHATGPT_USER_MESSAGE_TESTID_SELECTOR, [
          new FakeElement(env.document, 'div', prompt),
        ]);
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(
      PRE_SEND_DELAY_MS + CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS,
    );

    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('injects and confirms the exact 15,917-character ChatGPT handoff after a composer remount', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const markdownPrefix =
      '# 長篇交接測試\n請核對 **Unicode 中文**、`inline-code`、引號「完整」與 [官方文件](https://example.com/docs?q=1)。\n```ts\nconst quote = "保留";\n```\n';
    const renderedPrefix =
      '長篇交接測試\n請核對 Unicode 中文、inline-code、引號「完整」與 官方文件。\nconst quote = "保留";\n';
    const targetLength = 15_917;
    const filler = '多語內容ABC123\n'.repeat(Math.ceil((targetLength - markdownPrefix.length) / 11));
    const suffix = filler.slice(0, targetLength - markdownPrefix.length);
    const prompt = markdownPrefix + suffix;
    const renderedPrompt = renderedPrefix + suffix;
    expect(prompt).toHaveLength(targetLength);

    let submitted = '';
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        submitted = env.input.textContent;
        env.input.setVisibleText('');
        env.userMessages = [new FakeElement(env.document, 'div', renderedPrompt)];
      };
    }
    const originalInput = env.input;
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    env.input = new FakeTextAreaElement(env.document, 'textarea');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(originalInput.textContent).toBe(prompt);
    expect(submitted).toBe(prompt);
    expect(submitted).toHaveLength(targetLength);
    expect(env.sendButton?.clickCount).toBe(1);

    await vi.advanceTimersByTimeAsync(CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);
    expect(errorDone(env)).toBeUndefined();
  });

  it('anchors a ChatGPT retry response after its new matching user turn', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = 'retry after stopped response';
    env.responses = [new FakeElement(env.document, 'div', 'stopped previous answer')];
    let stoppedResponseRemount: FakeElement | undefined;
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        if (env.sendButton?.clickCount === 1) {
          stoppedResponseRemount = new FakeElement(env.document, 'div', 'stopped previous answer keeps mutating');
          env.responses = [stoppedResponseRemount];
          return;
        }
        env.input.setVisibleText('');
        env.userMessages = [new FakeElement(env.document, 'div', prompt)];
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);

    await vi.advanceTimersByTimeAsync(CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(2);
    expect(env.emitted.some((message) => message.payload === stoppedResponseRemount?.textContent)).toBe(false);

    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    turn.appendChild(copyButton);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    const retriedResponse = new FakeElement(env.document, 'div', 'answer for the retried prompt');
    turn.appendChild(retriedResponse);
    env.responses = [
      stoppedResponseRemount as FakeElement,
      retriedResponse,
    ];
    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 100);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'answer for the retried prompt',
    });
    expect(env.emitted.some((message) => message.payload === 'stopped previous answer keeps mutating')).toBe(false);
  });

  it('does not activate a retry when the first ChatGPT send is confirmed during lookup', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = 'confirmation races retry lookup';
    const firstButton = env.sendButton;
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(firstButton?.clickCount).toBe(1);

    // Make the retry's send-button lookup wait. While it is awaiting, the first click finally
    // commits and ChatGPT mounts the matching user turn.
    env.sendButton = null;
    await vi.advanceTimersByTimeAsync(CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);
    env.input.setVisibleText('');
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    await vi.advanceTimersByTimeAsync(SEND_BUTTON_SELECTOR_TIMEOUT_MS);

    expect(firstButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);
    expect(env.input.textContent).toBe('');
    expect(errorDone(env)).toBeUndefined();
  });

  it('does not treat a remounted old matching ChatGPT user turn as a new send', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const prompt = 'same prompt';
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    if (env.sendButton) {
      env.sendButton.onClick = () => {
        env.input.setVisibleText('');
        env.userMessages = [new FakeElement(env.document, 'div', prompt)];
      };
    }
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, prompt, 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);

    expect(errorDone(env)?.payload).toBe(
      '[Error: chatgpt send could not be confirmed; composer cleared before a matching user turn appeared]',
    );
  });

  it('bounds ChatGPT stuck-draft recovery to an 18.8-second normal path', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'draft that never leaves', 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(2);
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS);
    expect(keyEventCount(env.input)).toBe(3);
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS - 1);
    expect(errorDone(env)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(errorDone(env)?.payload).toBe('[Error: chatgpt send was not accepted; draft is still in composer]');
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

  it('releases the page-side response lock when the host stops a timed-out provider', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'first draft');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    const engine = (window as unknown as { __MAC_ENGINE__?: { stop?: () => void } }).__MAC_ENGINE__;
    engine?.stop?.();
    await flushMicrotasks();

    send(handler, 'retry draft');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('retry draft');
    expect(env.sendButton?.clickCount).toBe(2);
    expect(errorDone(env)).toBeUndefined();
  });

  it('clicks Grok\'s live chat-stop-button when the host stops the provider', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const stopButton = new FakeElement(env.document, 'button');
    env.detectorElements.set(GROK_CHAT_STOP_BUTTON_SELECTOR, [stopButton]);
    const handler = await installEngine(env);
    // The live selector is intentionally absent from the adapter payload. This proves the engine's
    // provider-specific supplement protects already installed v1.8.7 adapters too.
    dispatchAdapter(handler);

    send(handler, 'long-running request');
    await flushMicrotasks();
    const engine = (window as unknown as { __MAC_ENGINE__?: { stop?: () => void } }).__MAC_ENGINE__;
    engine?.stop?.();

    expect(stopButton.clickCount).toBe(1);
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

  it('keeps Grok Heavy in flight while the live chat-stop-button remains visible', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const stopButton = new FakeElement(env.document, 'button');
    env.detectorElements.set(GROK_CHAT_STOP_BUTTON_SELECTOR, [stopButton]);
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, 'use Heavy reasoning');
    await flushMicrotasks();
    env.responses = [new FakeElement(env.document, 'div', 'intermediate Heavy answer')];
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(8_000);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_CHUNK',
      provider: 'grok',
      payload: 'intermediate Heavy answer',
    });
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    env.detectorElements.set(GROK_CHAT_STOP_BUTTON_SELECTOR, []);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(10);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: 'intermediate Heavy answer',
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

  it('does not emit a previous answer when its DOM element remounts for a new turn', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    env.responses = [new FakeElement(env.document, 'div', 'previous Grok answer')];
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      timing: {
        doneDelayMs: 10,
        chunkDebounceMs: 0,
        statusIntervalMs: 1_000_000,
        backupPollMs: 10,
      },
    });

    send(handler, 'next question');
    await flushMicrotasks();
    env.responses = [new FakeElement(env.document, 'div', 'previous Grok answer')];
    await vi.advanceTimersByTimeAsync(50);

    expect(env.emitted.some((message) => message.action === 'RESPONSE_CHUNK')).toBe(false);
    expect(env.emitted.some((message) => message.action === 'RESPONSE_DONE')).toBe(false);

    env.responses = [
      new FakeElement(env.document, 'div', 'previous Grok answer'),
      new FakeElement(env.document, 'div', 'current Grok answer'),
    ];
    await vi.advanceTimersByTimeAsync(20);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: 'current Grok answer',
    });
    expect(env.emitted.some((message) => message.payload === 'previous Grok answer')).toBe(false);
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

    // The last render batch lands as the "still generating" signal clears. The cache still holds
    // only the opening line, the next backup poll is 1000ms away, and the done timer fires in
    // 100ms — so finishing from the cache would drop the tail.
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

  it('does not finish ChatGPT Astra when current-turn completion structure is missing', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    send(handler, 'solve this carefully', 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', 'solve this carefully')];
    env.responses = [new FakeElement(env.document, 'div', 'an Astra intermediate answer')];
    await vi.advanceTimersByTimeAsync(5_000);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_CHUNK',
      provider: 'chatgpt',
      payload: 'an Astra intermediate answer',
    });
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);
  });

  it('does not finish ChatGPT Astra from a transient current-turn copy marker', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    send(handler, 'keep reasoning', 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', 'keep reasoning')];
    const turn = new FakeElement(env.document, 'article');
    const transientCopyButton = new FakeElement(env.document, 'button');
    transientCopyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    turn.appendChild(transientCopyButton);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    const response = new FakeElement(env.document, 'div', 'temporary Astra answer');
    turn.appendChild(response);
    env.responses = [response];

    // Two 400 ms samples and less than 1200 ms are deliberately insufficient evidence.
    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS * 2);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    transientCopyButton.remove();
    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS);

    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);
  });

  it('finishes ChatGPT Astra only after the same current turn, full text, and marker stay stable', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    send(handler, 'finish only when stable', 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', 'finish only when stable')];
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    turn.appendChild(copyButton);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    const response = new FakeElement(env.document, 'div', 'the complete Astra answer');
    turn.appendChild(response);
    env.responses = [response];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    // Allow the >=1200 ms duration, at least three 400 ms samples, and the normal done delay.
    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 1);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'the complete Astra answer',
    });
  });

  it('restarts ChatGPT Astra terminal confirmation when the full response text is rewritten', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    send(handler, 'revise before finishing', 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', 'revise before finishing')];
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    turn.appendChild(copyButton);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    const response = new FakeElement(env.document, 'div', 'draft Astra answer');
    turn.appendChild(response);
    env.responses = [response];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS * 2);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    response.textContent = 'rewritten complete Astra answer';
    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 1);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'rewritten complete Astra answer',
    });
  });

  it('does not combine response text from one ChatGPT turn with a copy marker from another', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    send(handler, 'keep turn evidence together', 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', 'keep turn evidence together')];

    const textTurn = new FakeElement(env.document, 'article');
    const response = new FakeElement(env.document, 'div', 'answer whose own turn is unfinished');
    textTurn.appendChild(response);
    const markerTurn = new FakeElement(env.document, 'article');
    const unrelatedCopyButton = new FakeElement(env.document, 'button');
    unrelatedCopyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    markerTurn.appendChild(unrelatedCopyButton);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [textTurn, markerTurn]);
    env.responses = [response];

    await vi.advanceTimersByTimeAsync(
      1_000 + CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS,
    );

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_CHUNK',
      provider: 'chatgpt',
      payload: 'answer whose own turn is unfinished',
    });
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);
  });

  it('restarts ChatGPT Astra terminal confirmation when the same text remounts in a new turn', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'replace the whole turn before finishing';
    const answer = 'same visible Astra answer';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];

    const firstTurn = new FakeElement(env.document, 'article');
    const firstCopyButton = new FakeElement(env.document, 'button');
    firstCopyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const firstResponse = new FakeElement(env.document, 'div', answer);
    firstTurn.appendChild(firstCopyButton);
    firstTurn.appendChild(firstResponse);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [firstTurn]);
    env.responses = [firstResponse];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS * 2);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    const replacementTurn = new FakeElement(env.document, 'article');
    const replacementCopyButton = new FakeElement(env.document, 'button');
    replacementCopyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const replacementResponse = new FakeElement(env.document, 'div', answer);
    replacementTurn.appendChild(replacementCopyButton);
    replacementTurn.appendChild(replacementResponse);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [replacementTurn]);
    env.responses = [replacementResponse];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 1);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: answer,
    });
  });

  it('blocks ChatGPT completion for active external status but ignores history labels and completed progress', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'wait for the external reasoning sidecar';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    await vi.advanceTimersByTimeAsync(10);
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const completedProgress = new FakeElement(env.document, 'div');
    completedProgress.setAttribute('role', 'progressbar');
    completedProgress.setAttribute('value', '100');
    completedProgress.setAttribute('max', '100');
    const response = new FakeElement(env.document, 'div', 'complete answer behind sidecar');
    turn.appendChild(copyButton);
    turn.appendChild(completedProgress);
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    const externalStatus = new FakeElement(env.document, 'div', 'Pro thinking');
    externalStatus.setAttribute('role', 'status');
    env.detectorElements.set('[role="status"]', [externalStatus]);
    await vi.advanceTimersByTimeAsync(20);
    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);

    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: true },
    });

    await vi.advanceTimersByTimeAsync(
      1_000 + CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS,
    );
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    externalStatus.textContent = 'Thought for 12s';
    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: false },
    });

    await vi.advanceTimersByTimeAsync(
      1_000 + CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 100,
    );
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'complete answer behind sidecar',
    });
  });

  it('uses an anchored empty status aria-label to block, then fully re-confirms after its completed label', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'wait for the aria-labelled reasoning status';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);

    // Create the matching user turn before the external status so document order verifies that the
    // otherwise page-global status belongs to this response rather than stale page chrome.
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    await vi.advanceTimersByTimeAsync(10);
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const response = new FakeElement(env.document, 'div', 'answer gated by an aria label');
    turn.appendChild(copyButton);
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    const externalStatus = new FakeElement(env.document, 'div');
    externalStatus.setAttribute('role', 'status');
    externalStatus.setAttribute('aria-label', 'Pro thinking');
    env.detectorElements.set('[role="status"]', [externalStatus]);
    await vi.advanceTimersByTimeAsync(20);
    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);

    expect(externalStatus.textContent).toBe('');
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: true },
    });

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    externalStatus.setAttribute('aria-label', 'Reasoning Thought for 12s');
    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: false },
    });

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    // The first post-label sample can be one full interval away; it must then remain stable for
    // the complete 1200 ms gate before DONE is eligible.
    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS * 2 + 100);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'answer gated by an aria label',
    });
  });

  it('treats a page-global "Reasoning Thought for 12s" status as completed for status, send, and terminal gating', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const completedStatus = new FakeElement(env.document, 'div', 'Reasoning Thought for 12s');
    completedStatus.setAttribute('role', 'status');
    env.detectorElements.set('[role="status"]', [completedStatus]);
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: false },
    });

    const prompt = 'a completed reasoning label must not reject this send';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    expect(env.input.textContent).toBe(prompt);
    expect(errorDone(env)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);

    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const response = new FakeElement(env.document, 'div', 'answer after completed reasoning');
    turn.appendChild(copyButton);
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 1);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'answer after completed reasoning',
    });
  });

  it('ignores an unrelated page-global class containing reasoning', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const unrelatedControl = new FakeElement(env.document, 'div', 'Reasoning');
    unrelatedControl.setAttribute('class', 'sidebar-reasoning-preference');
    env.detectorElements.set('[class*="reasoning"]', [unrelatedControl]);
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: false },
    });

    send(handler, 'the unrelated sidebar must not block sending', 'chatgpt');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.input.textContent).toBe('the unrelated sidebar must not block sending');
    expect(env.sendButton?.clickCount).toBe(1);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)).toBeUndefined();
  });

  it('treats aria-valuenow 100 with omitted aria-valuemax as a completed ChatGPT progressbar', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'use the ARIA default progress maximum';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const completedProgress = new FakeElement(env.document, 'div');
    completedProgress.setAttribute('role', 'progressbar');
    completedProgress.setAttribute('aria-valuenow', '100');
    const response = new FakeElement(env.document, 'div', 'answer after default-max progress');
    turn.appendChild(copyButton);
    turn.appendChild(completedProgress);
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: false },
    });

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 100);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'answer after default-max progress',
    });
  });

  it('keeps ChatGPT in flight for an active verified sidecar progressbar, then fully re-confirms completion', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'wait for the external reasoning progress';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);
    expect(env.sendButton?.clickCount).toBe(1);

    // The matching user turn is allocated before the external sidecar so document order binds the
    // otherwise page-global reasoning UI to this response instead of stale history or page chrome.
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    await vi.advanceTimersByTimeAsync(10);
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const response = new FakeElement(env.document, 'div', 'answer behind external progress');
    turn.appendChild(copyButton);
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    const sidecar = new FakeElement(env.document, 'aside');
    sidecar.setAttribute('data-testid', 'reasoning-sidecar');
    const progress = new FakeElement(env.document, 'div');
    progress.setAttribute('role', 'progressbar');
    sidecar.appendChild(progress);
    env.detectorElements.set(CHATGPT_REASONING_SIDECAR_SELECTOR, [sidecar]);

    await vi.advanceTimersByTimeAsync(20);
    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: true },
    });

    await vi.advanceTimersByTimeAsync(
      1_000 + CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS,
    );
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    // ARIA progressbars default aria-valuemax to 100. Reaching 100 removes the activity veto but
    // must start a fresh terminal-stability window rather than inheriting samples from before it.
    progress.setAttribute('aria-valuenow', '100');
    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);
    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: false },
    });

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000 + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS * 2 + 100);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'answer behind external progress',
    });
  });

  it('rejects ChatGPT activation when native stop activity appears during the pre-send delay', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'must not interrupt activity that starts before activation', 'chatgpt');
    await flushMicrotasks();
    expect(env.input.textContent).toBe('must not interrupt activity that starts before activation');

    env.detectorElements.set(CHATGPT_STOP_BUTTON_SELECTOR, [new FakeElement(env.document, 'button')]);
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(env.sendButton?.clickCount).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)?.payload).toBe('[Error: chatgpt send rejected: provider is still generating]');
  });

  it('rejects ChatGPT activation when native stop activity appears during async send-button lookup', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea', sendButton: null });
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'must not interrupt activity that starts during lookup', 'chatgpt');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    const lateButton = new FakeElement(env.document, 'button');
    env.sendButton = lateButton;
    env.detectorElements.set(CHATGPT_STOP_BUTTON_SELECTOR, [new FakeElement(env.document, 'button')]);
    await vi.advanceTimersByTimeAsync(SELECTOR_RETRY_INTERVAL_MS);
    await flushMicrotasks();

    expect(lateButton.clickCount).toBe(0);
    expect(keyEventCount(env.input)).toBe(0);
    expect(errorDone(env)?.payload).toBe('[Error: chatgpt send rejected: provider is still generating]');
  });

  it('restarts ChatGPT terminal confirmation when the response element remounts with identical text in the same turn', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'wait through an identical response remount';
    const answer = 'identical visible Astra answer';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const firstResponse = new FakeElement(env.document, 'div', answer);
    turn.appendChild(copyButton);
    turn.appendChild(firstResponse);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [firstResponse];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS * 2);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    firstResponse.remove();
    const replacementResponse = new FakeElement(env.document, 'div', answer);
    turn.appendChild(replacementResponse);
    env.responses = [replacementResponse];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 1);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: answer,
    });
  });

  it('finishes a loaded image-only ChatGPT turn without a copy action only after the full stable gate', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'draw a finished aurora';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    const turn = new FakeElement(env.document, 'article');
    const response = new FakeElement(env.document, 'div');
    response.appendChild(
      new FakeImageElement(env.document, 'finished aurora', { complete: true, naturalWidth: 1024 }),
    );
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_STABLE_MS - 1);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 1);
    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: '[Image generated: finished aurora]',
    });
  });

  it('does not finish an unloaded image-only ChatGPT turn without a copy action', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 10 },
    });

    const prompt = 'wait for every image byte';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    const turn = new FakeElement(env.document, 'article');
    const response = new FakeElement(env.document, 'div');
    response.appendChild(
      new FakeImageElement(env.document, 'still loading', { complete: false, naturalWidth: 0 }),
    );
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    await vi.advanceTimersByTimeAsync(
      CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS * 2 + 100,
    );

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_CHUNK',
      provider: 'chatgpt',
      payload: '[Image generated: still loading]',
    });
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);
  });

  it('rejects a new ChatGPT send without mutating the composer while native generation is visible', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    env.detectorElements.set(CHATGPT_STOP_BUTTON_SELECTOR, [new FakeElement(env.document, 'button')]);
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      thinkingDetectors: [CHATGPT_STOP_BUTTON_SELECTOR],
    });

    send(handler, 'do not interrupt the active Astra turn', 'chatgpt');
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + 1);

    // Explicit retryable contract recommended for a workflow handoff that arrives too early.
    expect(errorDone(env)?.payload).toBe('[Error: chatgpt send rejected: provider is still generating]');
    expect(env.input.textContent).toBe('');
    expect(env.sendButton?.clickCount).toBe(0);
  });

  it('does not reject a new ChatGPT send for plain activity words in a completed historical turn', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const completedTurn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const answerHeading = new FakeElement(env.document, 'p', 'Planning');
    const quotedStatus = new FakeElement(env.document, 'p', 'Pro thinking');
    completedTurn.appendChild(copyButton);
    completedTurn.appendChild(answerHeading);
    completedTurn.appendChild(quotedStatus);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [completedTurn]);
    env.responses = [answerHeading];
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    send(handler, 'start the next serial handoff', 'chatgpt');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS);

    expect(errorDone(env)).toBeUndefined();
    expect(env.sendButton?.clickCount).toBe(1);
  });

  it('keeps a plain current-turn Pro thinking label active despite transient completion UI', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, { provider: 'chatgpt' });

    const prompt = 'keep the Astra turn alive';
    send(handler, prompt, 'chatgpt');
    await flushMicrotasks();
    env.userMessages = [new FakeElement(env.document, 'div', prompt)];
    const turn = new FakeElement(env.document, 'article');
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    const response = new FakeElement(env.document, 'p', 'Pro thinking');
    turn.appendChild(copyButton);
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];

    handler({ v: 1, action: 'CHECK_STATUS', provider: 'chatgpt' } as BridgeMessage);

    expect(env.emitted.at(-1)).toMatchObject({
      action: 'STATUS_REPORT',
      provider: 'chatgpt',
      payload: { login: 'logged_in', thinking: true },
    });
  });

  it('keeps waiting while a ChatGPT turn has not grown its copy button, then finishes once it does', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      thinkingDetectors: ['.thinking'],
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 1_000 },
    });
    if (env.sendButton) env.sendButton.onClick = () => env.input.setVisibleText('');

    send(handler, 'ask something', 'chatgpt');
    await flushMicrotasks();
    env.thinking = true;
    env.userMessages = [new FakeElement(env.document, 'div', 'ask something')];
    const turn = new FakeElement(env.document, 'article');
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    const response = new FakeElement(env.document, 'div', 'the full answer');
    turn.appendChild(response);
    env.responses = [response];
    await vi.advanceTimersByTimeAsync(1_000);

    // The stop button goes away while the turn is still rendering. Finishing here is what used to
    // cut multi-step answers short, because a pause reads exactly like a finished answer.
    env.thinking = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    turn.appendChild(copyButton);
    await vi.advanceTimersByTimeAsync(
      1_000 + CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 100,
    );

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'the full answer',
    });
  });

  it('does not time out immediately after a ChatGPT turn spends over ten minutes thinking', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      thinkingDetectors: ['.thinking'],
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 1_000 },
    });
    if (env.sendButton) env.sendButton.onClick = () => env.input.setVisibleText('');

    send(handler, 'take your time', 'chatgpt');
    await flushMicrotasks();
    env.thinking = true;
    env.userMessages = [new FakeElement(env.document, 'div', 'take your time')];
    const turn = new FakeElement(env.document, 'article');
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    const workingResponse = new FakeElement(env.document, 'div', 'working draft');
    turn.appendChild(workingResponse);
    env.responses = [workingResponse];
    await vi.advanceTimersByTimeAsync(601_000);

    env.thinking = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    const finishedResponse = new FakeElement(env.document, 'div', 'finished answer');
    turn.appendChild(finishedResponse);
    env.responses = [finishedResponse];
    const copyButton = new FakeElement(env.document, 'button');
    copyButton.setAttribute('data-testid', CHATGPT_COPY_BUTTON_TEST_ID);
    turn.appendChild(copyButton);
    await vi.advanceTimersByTimeAsync(
      1_000 + CHATGPT_TERMINAL_STABLE_MS + CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS + 100,
    );

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: 'finished answer',
    });
  });

  it('fails closed instead of returning partial text when ChatGPT completion cannot be confirmed', async () => {
    vi.useFakeTimers();
    const env = createEnv({ inputKind: 'textarea' });
    const handler = await installEngine(env);
    dispatchAdapter(handler, {
      provider: 'chatgpt',
      thinkingDetectors: ['.thinking'],
      timing: { doneDelayMs: 100, chunkDebounceMs: 0, statusIntervalMs: 1_000_000, backupPollMs: 1_000 },
    });
    if (env.sendButton) env.sendButton.onClick = () => env.input.setVisibleText('');

    send(handler, 'ask something', 'chatgpt');
    await flushMicrotasks();
    env.thinking = true;
    env.userMessages = [new FakeElement(env.document, 'div', 'ask something')];
    // A turn that never grows a copy button stands in for the testid being renamed upstream.
    const turn = new FakeElement(env.document, 'article');
    const response = new FakeElement(env.document, 'div', 'the full answer');
    turn.appendChild(response);
    env.detectorElements.set(CHATGPT_TURN_SELECTOR, [turn]);
    env.responses = [response];
    await vi.advanceTimersByTimeAsync(1_000);
    env.thinking = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);

    // Selector drift must not convert an unfinished answer into a successful partial response.
    await vi.advanceTimersByTimeAsync(599_000);
    expect(env.emitted.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(env.emitted).toContainEqual({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'chatgpt',
      payload: '[Error: chatgpt response completion could not be confirmed]',
    });
  });
});

function createEnv(options: { inputKind: 'textarea' | 'input' | 'contenteditable'; sendButton?: FakeElement | null }): FakeDomEnv {
  const document = new FakeDocument();
  const input =
    options.inputKind === 'textarea'
      ? new FakeTextAreaElement(document, 'textarea')
      : options.inputKind === 'input'
        ? new FakeInputElement(document, 'input')
      : new FakeElement(document, 'div');
  const env: FakeDomEnv = {
    document,
    emitted: [],
    handlers: [],
    input,
    sendButton: options.sendButton === undefined ? new FakeElement(document, 'button') : options.sendButton,
    responses: [],
    userMessages: [],
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
  hidden = false;
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
  private readonly documentOrder: number;

  constructor(
    private readonly fakeDocument: FakeDocument,
    readonly tagName: string,
    text = '',
  ) {
    this.textContent = text;
    this.documentOrder = fakeDocument.allocateDocumentOrder();
  }

  compareDocumentPosition(other: FakeElement): number {
    if (other.fakeDocument !== this.fakeDocument) return 0x01;
    if (this.documentOrder < other.documentOrder) return 0x04;
    if (this.documentOrder > other.documentOrder) return 0x02;
    return 0;
  }

  contains(candidate: FakeElement | null): boolean {
    let current = candidate;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
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
    const attribute = /^\[([\w-]+)="(.+)"\]$/.exec(selector);
    if (attribute) {
      return this.children.find((child) => child.getAttribute(attribute[1]) === attribute[2]) ?? null;
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

class FakeInputElement extends FakeElement {
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
  readonly complete: boolean;
  readonly naturalWidth: number;

  constructor(
    fakeDocument: FakeDocument,
    readonly alt: string,
    state: { complete?: boolean; naturalWidth?: number } = {},
  ) {
    super(fakeDocument, 'img');
    this.complete = state.complete ?? true;
    this.naturalWidth = state.naturalWidth ?? 100;
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
  private nextDocumentOrder = 0;
  readonly body = new FakeElement(this, 'body');
  execCommandResult = false;
  execCommandMutates = false;

  allocateDocumentOrder(): number {
    this.nextDocumentOrder += 1;
    return this.nextDocumentOrder;
  }

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
    const currentUserMessages = selectors.flatMap(
      (part) => this.requireEnv().detectorElements.get(part) ?? [],
    );
    if (
      selectors.includes(CHATGPT_USER_MESSAGE_TESTID_SELECTOR) &&
      currentUserMessages.length > 0
    ) {
      return [...new Set(currentUserMessages)] as unknown as Element[];
    }
    if (selectors.includes('[data-message-author-role="user"]')) {
      return this.requireEnv().userMessages as unknown as Element[];
    }
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
    HTMLInputElement: typeof FakeInputElement;
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
    HTMLInputElement: FakeInputElement,
  };
  fakeWindow.self = fakeWindow;
  fakeWindow.top = fakeWindow;

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', env.document);
  vi.stubGlobal('location', { href: 'https://grok.com', hostname: 'grok.com', pathname: '/' });
  vi.stubGlobal('HTMLTextAreaElement', FakeTextAreaElement);
  vi.stubGlobal('HTMLInputElement', FakeInputElement);
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
