import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider, BridgeMessage } from '../../shared/types';

const PRE_SEND_DELAY_MS = 800;
const SEND_BUTTON_SELECTOR_TIMEOUT_MS = 800;
const SEND_RETRY_DELAY_MS = 1500;
const SEND_FINAL_VERIFY_DELAY_MS = 1500;

type InputStrategyName = 'default' | 'prosemirror-paste' | 'quill-angular';
type SendStrategy = 'click' | 'enter';

interface TestAdapter {
  provider: AIProvider;
  adapterVersion: number;
  inputSelectors: string[];
  sendButtonSelectors: string[];
  responseSelectors: string[];
  loginDetectors: string[];
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
}

describe('injected engine input hardening', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
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
    activeChild.dispatchReturn = false;
    env.input.focusTarget = activeChild;
    const handler = await installEngine(env);
    dispatchAdapter(handler);

    send(handler, 'hello');
    await vi.advanceTimersByTimeAsync(PRE_SEND_DELAY_MS + SEND_BUTTON_SELECTOR_TIMEOUT_MS);

    expect(keyEventCount(activeChild)).toBe(3);
    expect(keyEventCount(env.input)).toBe(3);
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
    env.input.dispatchReturn = false;
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

function send(handler: (message: BridgeMessage) => void, text: string) {
  handler({ v: 1, action: 'SEND_MESSAGE', provider: 'grok', payload: { text } });
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
  dispatchThrows = false;
  clickThrows = false;
  clickCount = 0;
  focusTarget?: FakeElement;
  onClick?: () => void;
  onDispatch?: (event: Event) => void;
  readonly events: string[] = [];
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
    if (this.dispatchThrows) throw new Error('dispatch failed');
    this.events.push(event.type);
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
    if (selector === '#editor') return this.requireEnv().input as unknown as Element;
    if (selector === 'button.send') return this.requireEnv().sendButton as unknown as Element | null;
    return null;
  }

  querySelectorAll(selector: string): Element[] {
    const selectors = selector.split(',').map((part) => part.trim());
    if (selectors.includes('.response')) return this.requireEnv().responses as unknown as Element[];
    if (selectors.includes('#editor')) return [this.requireEnv().input as unknown as Element];
    if (selectors.includes('button.send') && this.requireEnv().sendButton) {
      return [this.requireEnv().sendButton as unknown as Element];
    }
    return [];
  }

  createRange() {
    return {
      selectNodeContents(_el: Element) {
        // no-op for fake selection
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
  vi.stubGlobal('location', { href: 'https://grok.com', hostname: 'grok.com' });
  vi.stubGlobal('HTMLTextAreaElement', FakeTextAreaElement);
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
