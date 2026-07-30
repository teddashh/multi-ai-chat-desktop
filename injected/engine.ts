import type { AIProvider, BridgeMessage } from '../shared/types';
import { isProviderChallengeActive } from './challenge';
import { buildReportDigest, type ReportElement } from './reportDigest';
import { longerResponseText, serializeResponseText } from './responseSerializer';

type InputStrategyName = 'default' | 'prosemirror-paste' | 'quill-angular';
type SendStrategy = 'click' | 'enter';

interface DetectorObject {
  selector: string;
  textIncludes?: string;
  textExcludes?: string;
}

type Detector = string | DetectorObject;
type ChallengeMutationGuard = () => void;

interface AdapterConfig {
  provider: AIProvider;
  adapterVersion: number;
  inputSelectors: string[];
  sendButtonSelectors: string[];
  responseSelectors: string[];
  loginDetectors: string[];
  loggedOutDetectors?: Detector[];
  thinkingDetectors?: Detector[];
  stopButtonSelectors?: string[];
  inputStrategy: InputStrategyName;
  sendStrategy?: SendStrategy;
  timing?: {
    doneDelayMs?: number;
    chunkDebounceMs?: number;
    statusIntervalMs?: number;
    backupPollMs?: number;
  };
}

interface MacEngineState {
  bootId: string;
  adapterVersion: number;
  stop?: () => void;
}

type InputStrategy = (el: Element, text: string, assertCanMutate: ChallengeMutationGuard) => void | Promise<void>;

interface RetryLookupOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

interface SendActivationResult {
  ok: boolean;
  path: 'button-click' | 'enter-key';
  detail?: string;
}

const SELECTOR_RETRY_INTERVAL_MS = 250;
const INPUT_SELECTOR_TIMEOUT_MS = 2500;
const SEND_BUTTON_SELECTOR_TIMEOUT_MS = 800;
const PRE_SEND_DELAY_MS = 800;
const SEND_RETRY_DELAY_MS = 1500;
const SEND_FINAL_VERIFY_DELAY_MS = 1500;
const USER_MESSAGE_ANCESTOR_SELECTOR = [
  '[data-message-author-role="user"]',
  '[data-testid="user-message"]',
  'div[id^="response-"].items-end',
  '.message-bubble.user',
].join(', ');

export function isLikelyPromptEcho(responseText: string, promptText: string): boolean {
  const trimmedResponse = responseText.trim();
  const trimmedPrompt = promptText.trim();
  if (trimmedResponse && trimmedResponse === trimmedPrompt) return true;

  const responseKey = promptEchoComparisonKey(responseText);
  const promptKey = promptEchoComparisonKey(promptText);
  if (!responseKey || !promptKey) return false;
  if (responseKey === promptKey) return true;

  const shorterLength = Math.min(responseKey.length, promptKey.length);
  const longerLength = Math.max(responseKey.length, promptKey.length);
  if (shorterLength < 40 || shorterLength / longerLength < 0.9) return false;
  if (responseKey.includes(promptKey) || promptKey.includes(responseKey)) return true;

  const sampleLength = Math.min(80, Math.floor(shorterLength / 3));
  return (
    responseKey.slice(0, sampleLength) === promptKey.slice(0, sampleLength) &&
    responseKey.slice(-sampleLength) === promptKey.slice(-sampleLength)
  );
}

function promptEchoComparisonKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

export async function retryLookup<T>(lookup: () => T | null | undefined, options: RetryLookupOptions = {}): Promise<T | null> {
  const intervalMs = Math.max(1, options.intervalMs ?? SELECTOR_RETRY_INTERVAL_MS);
  const timeoutMs = Math.max(0, options.timeoutMs ?? INPUT_SELECTOR_TIMEOUT_MS);
  const startedAt = Date.now();

  while (true) {
    const found = lookup();
    if (found) return found;

    const elapsed = Date.now() - startedAt;
    if (elapsed >= timeoutMs) return null;

    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

class InputInjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputInjectionError';
  }
}

class ChallengeActiveError extends Error {
  constructor() {
    super('security challenge is active');
    this.name = 'ChallengeActiveError';
  }
}

class InactiveSendOperationError extends Error {
  constructor() {
    super('send operation is no longer active');
    this.name = 'InactiveSendOperationError';
  }
}

(function engine() {
  if (typeof window === 'undefined') return;
  if (window.self !== window.top) return;
  if (!window.__MAC_BRIDGE__) return;

  const bridge = window.__MAC_BRIDGE__;
  const existing = window.__MAC_ENGINE__ as MacEngineState | undefined;
  if (existing?.bootId === bridge.bootId) return;

  let adapter: AdapterConfig | undefined;
  let statusInterval: number | undefined;
  let responseTimeout: number | undefined;
  let finishResponseTimeout: number | undefined;
  let checkDoneInterval: number | undefined;
  let pollInterval: number | undefined;
  let lastSeenResponseEl: Element | null = null;
  let responseBaselineEls = new Set<Element>();
  let waitingForResponse = false;
  let responseGeneration = 0;
  let activeResponseGeneration = 0;
  let nextSendOperation = 0;
  let activeSendOperation: number | undefined;
  let draftStaging = false;
  let lastResponseText = '';
  let pendingPromptText = '';
  let lastChunkTime = 0;

  window.__MAC_ENGINE__ = {
    bootId: bridge.bootId,
    adapterVersion: 0,
    stop,
  };

  (window as unknown as { __MAC_REPORT__?: unknown }).__MAC_REPORT__ = {
    collect(adapterJson: unknown, appVersion: string) {
      try {
        const adapter = typeof adapterJson === 'string' ? JSON.parse(adapterJson) : adapterJson;
        return buildReportDigest(adapter as Parameters<typeof buildReportDigest>[0], {
          href: location.href,
          appVersion,
          querySelectorAll: (selector: string) =>
            Array.from(document.querySelectorAll(selector)) as unknown as ReportElement[],
        });
      } catch {
        return null;
      }
    },
  };

  const inputStrategies: Record<InputStrategyName, InputStrategy> = {
    default: defaultInjectInput,
    'prosemirror-paste': prosemirrorPasteInput,
    'quill-angular': quillAngularInput,
  };

  bridge.onDispatch((message: BridgeMessage) => {
    if (message.action === 'ADAPTER_UPDATE') {
      installAdapter(message.payload as AdapterConfig);
      return;
    }
    if (message.action === 'SEND_MESSAGE' && (!adapter || !message.provider || message.provider === adapter.provider)) {
      const sendOperation = beginSendOperation(message.provider);
      if (sendOperation === undefined) return;
      if (abortAutomationForChallenge(message.provider, true, 'send', sendOperation)) return;
      const payload = message.payload as { text?: string } | undefined;
      void sendMessage(payload?.text ?? '', message.provider, sendOperation);
      return;
    }
    if (message.action === 'FILL_DRAFT' && (!adapter || !message.provider || message.provider === adapter.provider)) {
      if (!beginFillOperation(message.provider)) return;
      if (abortAutomationForChallenge(message.provider, false, 'fill')) {
        releaseFillOperation();
        return;
      }
      const payload = message.payload as { text?: string } | undefined;
      void fillDraft(payload?.text ?? '', message.provider).finally(releaseFillOperation);
      return;
    }
    if (message.action === 'CHECK_STATUS') {
      reportStatus();
    }
  });

  function installAdapter(next: AdapterConfig) {
    const state = window.__MAC_ENGINE__ as MacEngineState;
    if (adapter && next.adapterVersion < adapter.adapterVersion) return;
    adapter = next;
    state.adapterVersion = next.adapterVersion;
    if (statusInterval !== undefined) window.clearInterval(statusInterval);
    reportStatus();
    statusInterval = window.setInterval(reportStatus, timing('statusIntervalMs', 10_000));
    observeResponses();
  }

  function queryFirst(selectors: string[] = []): Element | null {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function stop() {
    if (!adapter) return;
    if (abortAutomationForChallenge(adapter.provider, false, 'stop')) return;
    try {
      const button = queryFirst(adapter.stopButtonSelectors ?? []);
      (button as HTMLElement | null)?.click?.();
    } catch {
      // best effort
    }
  }

  function hasDetector(detectors: Detector[] = []): boolean {
    for (const detector of detectors) {
      if (typeof detector === 'string') {
        if (document.querySelector(detector)) return true;
        continue;
      }
      const matches = document.querySelectorAll(detector.selector);
      for (const el of matches) {
        const text = el.textContent ?? '';
        if (detector.textIncludes && !text.includes(detector.textIncludes)) continue;
        if (detector.textExcludes && text.includes(detector.textExcludes)) continue;
        return true;
      }
    }
    return false;
  }

  function reportStatus() {
    if (!adapter) {
      bridge.emit({ v: 1, action: 'STATUS_REPORT', payload: { dom: 'unknown', bootId: bridge.bootId } });
      return;
    }
    let login: 'logged_in' | 'logged_out' | 'blocked' = 'logged_out';
    if (isProviderChallengeActive(adapter.provider)) {
      login = 'blocked';
    } else if (hasDetector(adapter.loggedOutDetectors)) {
      login = 'logged_out';
    } else if (hasDetector(adapter.loginDetectors)) {
      login = 'logged_in';
    } else if (adapter.provider === 'gemini' && location.hostname === 'gemini.google.com') {
      login = 'blocked';
    }
    bridge.emit({
      v: 1,
      action: 'STATUS_REPORT',
      provider: adapter.provider,
      payload: { dom: 'ready', login, thinking: isThinking(), bootId: bridge.bootId },
    });
  }

  function reportChallengeBlocked(provider: AIProvider) {
    bridge.emit({
      v: 1,
      action: 'STATUS_REPORT',
      provider,
      payload: { dom: 'ready', login: 'blocked', thinking: false, bootId: bridge.bootId },
    });
  }

  function abortAutomationForChallenge(
    providerHint: AIProvider | undefined,
    errorAsDone: boolean,
    operation: 'send' | 'fill' | 'stop',
    sendOperation?: number,
  ): boolean {
    const provider = providerHint ?? adapter?.provider;
    if (!provider || !isProviderChallengeActive(provider)) return false;
    reportChallengeBlocked(provider);
    logEngine(`${provider} ${operation} refused: security challenge is active`);
    if (errorAsDone) doneWithError(`${provider} security challenge is active`, provider, sendOperation);
    return true;
  }

  function beginSendOperation(providerHint?: AIProvider): number | undefined {
    if (activeSendOperation !== undefined || draftStaging || waitingForResponse) {
      logEngine(`${providerHint ?? adapter?.provider ?? 'provider'} send rejected: response in flight`);
      return undefined;
    }
    nextSendOperation += 1;
    activeSendOperation = nextSendOperation;
    return nextSendOperation;
  }

  function beginFillOperation(providerHint?: AIProvider): boolean {
    if (activeSendOperation !== undefined || draftStaging || waitingForResponse) {
      logEngine(`${providerHint ?? adapter?.provider ?? 'provider'} fill rejected: response in flight`);
      return false;
    }
    draftStaging = true;
    return true;
  }

  function releaseFillOperation() {
    void Promise.resolve().then(() => {
      draftStaging = false;
    });
  }

  function isActiveSendOperation(sendOperation: number): boolean {
    return activeSendOperation === sendOperation;
  }

  function releaseSendOperation(sendOperation: number) {
    void Promise.resolve().then(() => {
      if (activeSendOperation === sendOperation && !waitingForResponse) {
        activeSendOperation = undefined;
      }
    });
  }

  async function stageDraftForResponse(
    text: string,
    providerHint?: AIProvider,
    challengeErrorAsDone = true,
    sendOperation?: number,
  ): Promise<{ activeAdapter: AdapterConfig; input: Element; injectionStartedAt: number } | undefined> {
    if (sendOperation !== undefined && !isActiveSendOperation(sendOperation)) return undefined;
    if (
      abortAutomationForChallenge(
        providerHint,
        challengeErrorAsDone,
        challengeErrorAsDone ? 'send' : 'fill',
        sendOperation,
      )
    ) {
      return undefined;
    }
    const activeAdapter = adapter;
    if (!activeAdapter) {
      doneWithError('adapter not installed', providerHint, sendOperation);
      return undefined;
    }
    const input = await retryLookup(() => queryFirst(activeAdapter.inputSelectors), {
      intervalMs: SELECTOR_RETRY_INTERVAL_MS,
      timeoutMs: INPUT_SELECTOR_TIMEOUT_MS,
    });
    if (sendOperation !== undefined && !isActiveSendOperation(sendOperation)) return undefined;
    if (!input) {
      doneWithError(`${activeAdapter.provider} input element not found`, activeAdapter.provider, sendOperation);
      return undefined;
    }
    if (
      abortAutomationForChallenge(
        activeAdapter.provider,
        challengeErrorAsDone,
        challengeErrorAsDone ? 'send' : 'fill',
        sendOperation,
      )
    ) {
      return undefined;
    }

    const existingResponses = document.querySelectorAll(activeAdapter.responseSelectors.join(', '));
    lastSeenResponseEl = existingResponses.length > 0 ? existingResponses[existingResponses.length - 1] : null;
    responseBaselineEls = new Set(existingResponses);
    responseGeneration += 1;
    activeResponseGeneration = responseGeneration;
    waitingForResponse = true;
    lastResponseText = '';
    pendingPromptText = text;
    startResponsePolling();

    const injectionStartedAt = Date.now();
    const operation = challengeErrorAsDone ? 'send' : 'fill';
    const assertCanMutate = () => {
      if (sendOperation !== undefined && !isActiveSendOperation(sendOperation)) {
        throw new InactiveSendOperationError();
      }
      if (
        abortAutomationForChallenge(
          activeAdapter.provider,
          challengeErrorAsDone,
          operation,
          sendOperation,
        )
      ) {
        throw new ChallengeActiveError();
      }
    };
    try {
      assertCanMutate();
      await inputStrategies[activeAdapter.inputStrategy](input, text, assertCanMutate);
      assertCanMutate();
      assertInputLanded(input, text, activeAdapter.inputStrategy);
    } catch (error) {
      if (error instanceof ChallengeActiveError) {
        if (!challengeErrorAsDone) cancelResponseWait();
        return undefined;
      }
      if (error instanceof InactiveSendOperationError) {
        return undefined;
      }
      doneWithError(
        `${activeAdapter.provider} input injection failed: ${errorMessage(error)}`,
        activeAdapter.provider,
        sendOperation,
      );
      return undefined;
    }

    return { activeAdapter, input, injectionStartedAt };
  }

  async function sendMessage(text: string, providerHint: AIProvider | undefined, sendOperation: number) {
    const staged = await stageDraftForResponse(text, providerHint, true, sendOperation);
    if (!staged) return;
    if (!isActiveSendOperation(sendOperation)) return;
    const { activeAdapter, input, injectionStartedAt } = staged;

    const preSendDelayMs = Math.max(0, PRE_SEND_DELAY_MS - (Date.now() - injectionStartedAt));
    window.setTimeout(() => {
      void (async () => {
        if (!isActiveSendOperation(sendOperation) || !waitingForResponse) return;
        if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) return;
        const firstAttempt = await activateSend(input, sendOperation);

        if (!isActiveSendOperation(sendOperation) || !waitingForResponse) return;
        window.setTimeout(() => {
          void retrySendIfStillPending(input, firstAttempt, activeAdapter, sendOperation);
        }, SEND_RETRY_DELAY_MS);
      })();
    }, preSendDelayMs);
  }

  async function fillDraft(text: string, providerHint?: AIProvider) {
    const staged = await stageDraftForResponse(text, providerHint, false);
    if (!staged) return;
    logEngine(`${staged.activeAdapter.provider} fill: draft staged, awaiting native send`);
  }

  async function retrySendIfStillPending(
    originalInput: Element,
    firstAttempt: SendActivationResult,
    originalAdapter: AdapterConfig,
    sendOperation: number,
  ) {
    if (!isActiveSendOperation(sendOperation) || !waitingForResponse || !adapter) return;
    if (abortAutomationForChallenge(originalAdapter.provider, true, 'send', sendOperation)) return;
    if (sendStarted(adapter)) return;

    const currentInput = queryFirst(adapter.inputSelectors);
    if (!currentInput) {
      if (!firstAttempt.ok) {
        doneWithError(
          `${originalAdapter.provider} input disappeared before send was confirmed`,
          originalAdapter.provider,
          sendOperation,
        );
      }
      return;
    }
    const inputText = getInputText(currentInput).trim();
    if (!inputText) return;

    if (firstAttempt.ok && firstAttempt.path === 'button-click') {
      const firstButton = querySendButton(adapter, currentInput);
      if (!firstButton || isDisabled(firstButton)) return;
    }

    const retryInput = currentInput ?? originalInput;
    const retryAttempt = await activateSend(retryInput, sendOperation);
    if (!isActiveSendOperation(sendOperation) || !waitingForResponse) return;

    if (!retryAttempt.ok) {
      doneWithError(
        `${originalAdapter.provider} send activation failed: ${retryAttempt.detail ?? firstAttempt.detail ?? retryAttempt.path}`,
        originalAdapter.provider,
        sendOperation,
      );
      return;
    }

    window.setTimeout(() => {
      void verifySendAfterRetry(retryAttempt, originalAdapter, sendOperation);
    }, SEND_FINAL_VERIFY_DELAY_MS);
  }

  async function verifySendAfterRetry(
    retryAttempt: SendActivationResult,
    originalAdapter: AdapterConfig,
    sendOperation: number,
  ) {
    const activeAdapter = adapter;
    if (
      !isActiveSendOperation(sendOperation) ||
      !waitingForResponse ||
      !activeAdapter ||
      activeAdapter.provider !== originalAdapter.provider
    ) {
      return;
    }
    if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) return;
    if (sendStarted(activeAdapter)) return;

    const currentInput = queryFirst(activeAdapter.inputSelectors);
    if (!currentInput) return;

    const sendButton = querySendButton(activeAdapter, currentInput);
    if (retryAttempt.path === 'button-click' && (!sendButton || isDisabled(sendButton))) return;
    const hadSendButton = Boolean(sendButton);

    if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) return;
    const enterOk = dispatchEnter(currentInput);
    logEngine(`${activeAdapter.provider} final send fallback: enter-key${enterOk ? '' : ' failed'}`);
    if (!enterOk) {
      doneWithError(
        `${activeAdapter.provider} send activation failed: enter key dispatch failed`,
        activeAdapter.provider,
        sendOperation,
      );
      return;
    }

    window.setTimeout(() => {
      if (
        !isActiveSendOperation(sendOperation) ||
        !waitingForResponse ||
        !adapter ||
        adapter.provider !== originalAdapter.provider
      ) {
        return;
      }
      if (abortAutomationForChallenge(adapter.provider, true, 'send', sendOperation)) return;
      if (sendStarted(adapter)) return;
      const finalInput = queryFirst(adapter.inputSelectors);
      const finalButton = finalInput ? querySendButton(adapter, finalInput) : null;
      if (!finalInput || !getInputText(finalInput).trim()) return;
      if (hadSendButton && (!finalButton || isDisabled(finalButton))) return;
      doneWithError(
        `${adapter.provider} send was not accepted; draft is still in composer`,
        adapter.provider,
        sendOperation,
      );
    }, SEND_FINAL_VERIFY_DELAY_MS);
  }

  async function activateSend(input: Element, sendOperation: number): Promise<SendActivationResult> {
    if (!isActiveSendOperation(sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'send operation is no longer active' };
    }
    const activeAdapter = adapter;
    if (!activeAdapter) return { ok: false, path: 'enter-key', detail: 'adapter not installed' };
    if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'security challenge is active' };
    }
    if (activeAdapter.sendStrategy !== 'enter') {
      const sendBtn = await retryLookup(() => querySendButton(activeAdapter, input), {
        intervalMs: SELECTOR_RETRY_INTERVAL_MS,
        timeoutMs: SEND_BUTTON_SELECTOR_TIMEOUT_MS,
      });
      if (!isActiveSendOperation(sendOperation)) {
        return { ok: false, path: 'enter-key', detail: 'send operation is no longer active' };
      }
      if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) {
        return { ok: false, path: 'enter-key', detail: 'security challenge is active' };
      }
      if (sendBtn) {
        if (isDisabled(sendBtn)) {
          logEngine(`${activeAdapter.provider} send path: send button disabled; falling back to enter`);
        } else {
          const clicked = clickElement(sendBtn, `${activeAdapter.provider} send button`);
          logEngine(`${activeAdapter.provider} send path: button-click${clicked ? '' : ' failed; falling back to enter'}`);
          if (clicked) return { ok: true, path: 'button-click' };
        }
      } else {
        logEngine(`${activeAdapter.provider} send path: send button not found; falling back to enter`);
      }
    }

    if (!isActiveSendOperation(sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'send operation is no longer active' };
    }
    if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'security challenge is active' };
    }
    const ok = dispatchEnter(input);
    logEngine(`${activeAdapter.provider} send path: enter-key${ok ? '' : ' failed'}`);
    return { ok, path: 'enter-key', detail: ok ? undefined : 'enter key dispatch failed' };
  }

  function defaultInjectInput(input: Element, text: string, assertCanMutate: ChallengeMutationGuard) {
    const el = input as HTMLElement;
    assertCanMutate();
    tryFocus(el, 'default input');
    assertCanMutate();

    if (input instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(input, text);
      else input.value = text;
      assertCanMutate();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      assertCanMutate();
    } else {
      assertCanMutate();
      try {
        const sel = window.getSelection();
        if (!sel) throw new InputInjectionError('selection unavailable');
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (error) {
        logEngine(`default input selection guard fell back to execCommand: ${errorMessage(error)}`);
      }
      assertCanMutate();
      const inserted = execInsertText(text);
      assertCanMutate();
      if (!inserted) throw new InputInjectionError('execCommand insertText returned false');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      assertCanMutate();
    }
  }

  async function prosemirrorPasteInput(el: Element, text: string, assertCanMutate: ChallengeMutationGuard) {
    const editor = el as HTMLElement;
    assertCanMutate();
    tryFocus(editor, 'prosemirror editor');
    assertCanMutate();

    try {
      tryFocus(editor, 'prosemirror paste');
      assertCanMutate();
      const selection = window.getSelection();
      if (!selection) throw new InputInjectionError('selection unavailable');
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);

      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      assertCanMutate();
      editor.dispatchEvent(pasteEvent);
      assertCanMutate();
      await Promise.resolve();
      assertCanMutate();
    } catch (error) {
      if (error instanceof ChallengeActiveError) throw error;
      logEngine(`prosemirror synthetic paste failed: ${errorMessage(error)}`);
    }

    assertCanMutate();
    if (!composerTextMatches(editor, text)) {
      try {
        tryFocus(editor, 'prosemirror insertText fallback');
        assertCanMutate();
        const selection = window.getSelection();
        if (!selection) throw new InputInjectionError('selection unavailable');
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        assertCanMutate();
        const inserted = execInsertText(text);
        assertCanMutate();
        if (inserted) {
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
          assertCanMutate();
          await Promise.resolve();
          assertCanMutate();
        }
      } catch (error) {
        if (error instanceof ChallengeActiveError) throw error;
        logEngine(`prosemirror insertText fallback failed: ${errorMessage(error)}`);
      }
    }

    assertCanMutate();
    if (!composerTextMatches(editor, text)) {
      assertCanMutate();
      editor.replaceChildren();
      const p = document.createElement('p');
      p.textContent = text;
      editor.appendChild(p);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      assertCanMutate();
    }
  }

  async function quillAngularInput(el: Element, text: string, assertCanMutate: ChallengeMutationGuard) {
    const editor = el as HTMLElement;
    assertCanMutate();
    tryFocus(editor, 'quill editor');
    assertCanMutate();
    // Trusted-Types-safe clear: Gemini enforces Trusted Types (CSP), under which ANY innerHTML
    // assignment — even '' — throws "requires 'TrustedHTML' assignment". replaceChildren() removes
    // all children with no HTML parsing, so it never trips Trusted Types.
    assertCanMutate();
    editor.replaceChildren();

    const lines = text.split('\n');
    const fragment = document.createDocumentFragment();
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line || '\u00A0';
      fragment.appendChild(p);
    }
    editor.appendChild(fragment);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    assertCanMutate();
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    assertCanMutate();

    await Promise.resolve();
    assertCanMutate();
    if (!editor.textContent?.trim()) {
      tryFocus(editor, 'quill fallback');
      assertCanMutate();
      const inserted = execInsertText(text);
      assertCanMutate();
      if (!inserted) throw new InputInjectionError('quill fallback execCommand insertText returned false');
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      assertCanMutate();
    }
  }

  function getLatestResponseText(): string | null {
    if (!adapter) return null;
    const responseEls = Array.from(document.querySelectorAll(adapter.responseSelectors.join(', ')));
    if (responseEls.length === 0) return null;
    for (let index = responseEls.length - 1; index >= 0; index -= 1) {
      const response = responseEls[index];
      if (waitingForResponse && responseBaselineEls.has(response)) continue;
      if (isUserMessageElement(response)) continue;
      const text = extractResponseText(response);
      if (text && !isLikelyPromptEcho(text, pendingPromptText)) return text;
    }
    return null;
  }

  function isUserMessageElement(response: Element): boolean {
    const closest = (response as Element & { closest?: (selector: string) => Element | null }).closest;
    if (typeof closest !== 'function') return false;
    try {
      return Boolean(closest.call(response, USER_MESSAGE_ANCESTOR_SELECTOR));
    } catch {
      return false;
    }
  }

  function extractResponseText(response: Element): string | null {
    const text = serializeResponseText(response);
    if (text) return text;
    const responseTag = typeof response.tagName === 'string' ? response.tagName.toUpperCase() : '';
    const asset = ['IMG', 'CANVAS', 'VIDEO'].includes(responseTag)
      ? response
      : response.querySelector?.('img, canvas, video') ?? null;
    if (!asset) return null;
    const alt = asset instanceof HTMLImageElement ? asset.alt.trim() : '';
    return alt ? `[Image generated: ${alt}]` : '[Image generated]';
  }

  function isThinking(): boolean {
    return hasDetector(adapter?.thinkingDetectors);
  }

  function checkIfDone(expectedGeneration = activeResponseGeneration) {
    if (!waitingForResponse || expectedGeneration !== activeResponseGeneration) return;
    if (isThinking()) {
      if (checkDoneInterval === undefined) {
        checkDoneInterval = window.setInterval(() => {
          if (!waitingForResponse || expectedGeneration !== activeResponseGeneration) {
            clearCheckDone();
            return;
          }
          if (!isThinking()) {
            clearCheckDone();
            finishResponseTimeout = window.setTimeout(() => {
              finishResponseTimeout = undefined;
              if (!waitingForResponse || expectedGeneration !== activeResponseGeneration) return;
              if (isThinking()) {
                checkIfDone(expectedGeneration);
                return;
              }
              finishResponse(expectedGeneration);
            }, timing('doneDelayMs', 3000));
          }
        }, 1000);
      }
      return;
    }
    finishResponse(expectedGeneration);
  }

  function finishResponse(expectedGeneration = activeResponseGeneration) {
    if (!waitingForResponse || expectedGeneration !== activeResponseGeneration || !adapter) return;
    // Must re-read before cancelResponseWait(): getLatestResponseText filters the send-time
    // baseline through waitingForResponse and responseBaselineEls, so after the reset it would
    // return a message that already existed before the send.
    const payload = longerResponseText(lastResponseText, getLatestResponseText());
    const sendOperation = activeSendOperation;
    cancelResponseWait();
    bridge.emit({ v: 1, action: 'RESPONSE_DONE', provider: adapter.provider, payload });
    if (sendOperation !== undefined) releaseSendOperation(sendOperation);
  }

  function cancelResponseWait() {
    waitingForResponse = false;
    clearTimersForResponse();
    responseBaselineEls.clear();
    pendingPromptText = '';
  }

  function doneWithError(reason: string, providerHint?: AIProvider, sendOperation?: number) {
    if (sendOperation !== undefined && !isActiveSendOperation(sendOperation)) return;
    const provider = providerHint ?? adapter?.provider;
    if (!provider) {
      if (sendOperation !== undefined) releaseSendOperation(sendOperation);
      return;
    }
    cancelResponseWait();
    bridge.emit({ v: 1, action: 'RESPONSE_DONE', provider, payload: `[Error: ${reason}]` });
    if (sendOperation !== undefined) releaseSendOperation(sendOperation);
  }

  let observerInstalled = false;
  function observeResponses() {
    if (observerInstalled) return;
    if (!document.body) {
      const install = () => {
        document.removeEventListener('DOMContentLoaded', install);
        observeResponses();
      };
      document.addEventListener('DOMContentLoaded', install, { once: true });
      return;
    }
    const observer = new MutationObserver(() => {
      if (!waitingForResponse) return;
      if (isThinking()) return;
      const currentText = getLatestResponseText();
      if (!currentText || currentText === lastResponseText) return;
      clearFinishResponseTimeout();
      lastResponseText = currentText;

      const now = Date.now();
      if (now - lastChunkTime >= timing('chunkDebounceMs', 500)) {
        lastChunkTime = now;
        if (adapter) bridge.emit({ v: 1, action: 'RESPONSE_CHUNK', provider: adapter.provider, payload: currentText });
      }
      if (responseTimeout !== undefined) window.clearTimeout(responseTimeout);
      const expectedGeneration = activeResponseGeneration;
      responseTimeout = window.setTimeout(
        () => checkIfDone(expectedGeneration),
        timing('doneDelayMs', 3000),
      );
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    observerInstalled = true;
  }

  function startResponsePolling() {
    if (pollInterval !== undefined) return;
    pollInterval = window.setInterval(() => {
      if (!waitingForResponse) {
        if (pollInterval !== undefined) window.clearInterval(pollInterval);
        pollInterval = undefined;
        return;
      }
      const currentText = getLatestResponseText();
      if (!currentText || currentText === lastResponseText) return;
      clearFinishResponseTimeout();
      lastResponseText = currentText;
      if (adapter) bridge.emit({ v: 1, action: 'RESPONSE_CHUNK', provider: adapter.provider, payload: currentText });
      if (responseTimeout !== undefined) window.clearTimeout(responseTimeout);
      const expectedGeneration = activeResponseGeneration;
      responseTimeout = window.setTimeout(
        () => checkIfDone(expectedGeneration),
        timing('doneDelayMs', 3000),
      );
    }, timing('backupPollMs', 3000));
  }

  function clearCheckDone() {
    if (checkDoneInterval !== undefined) window.clearInterval(checkDoneInterval);
    checkDoneInterval = undefined;
  }

  function clearFinishResponseTimeout() {
    if (finishResponseTimeout !== undefined) window.clearTimeout(finishResponseTimeout);
    finishResponseTimeout = undefined;
  }

  function clearTimersForResponse() {
    if (responseTimeout !== undefined) window.clearTimeout(responseTimeout);
    clearFinishResponseTimeout();
    if (pollInterval !== undefined) window.clearInterval(pollInterval);
    clearCheckDone();
    responseTimeout = undefined;
    pollInterval = undefined;
  }

  function timing(key: keyof NonNullable<AdapterConfig['timing']>, fallback: number): number {
    return adapter?.timing?.[key] ?? fallback;
  }

  function getInputText(input: Element | null): string {
    if (!input) return '';
    if (input instanceof HTMLTextAreaElement) return input.value;
    return input.textContent ?? '';
  }

  function assertInputLanded(input: Element, text: string, strategy: InputStrategyName) {
    if (!text.trim()) return;
    if (composerTextMatches(input, text)) return;
    if (!getInputText(input).trim()) throw new InputInjectionError(`${strategy} left editor empty after injection`);
    throw new InputInjectionError(`${strategy} produced mismatched editor text after injection`);
  }

  function composerTextMatches(input: Element, expected: string): boolean {
    const compact = (value: string) => value.replace(/\s+/g, '');
    return compact(getInputText(input)) === compact(expected);
  }

  function sendStarted(activeAdapter: AdapterConfig): boolean {
    if (!waitingForResponse) return true;
    if (isThinking()) return true;
    const responses = document.querySelectorAll(activeAdapter.responseSelectors.join(', '));
    const latest = responses.length > 0 ? responses[responses.length - 1] : null;
    if (latest && latest !== lastSeenResponseEl) return true;
    const currentInput = queryFirst(activeAdapter.inputSelectors);
    return Boolean(currentInput && !getInputText(currentInput).trim());
  }

  function querySendButton(activeAdapter: AdapterConfig, input: Element): Element | null {
    const closest = (input as Element & { closest?: (selectors: string) => Element | null }).closest;
    if (typeof closest === 'function') {
      const container = closest.call(input, 'form, fieldset, [data-testid*="composer"]');
      if (container) {
        for (const selector of activeAdapter.sendButtonSelectors) {
          const candidate = container.querySelector(selector);
          if (candidate) return candidate;
        }
      }
    }
    return queryFirst(activeAdapter.sendButtonSelectors);
  }

  function execInsertText(text: string): boolean {
    if (typeof document.execCommand !== 'function') return false;
    try {
      return document.execCommand('insertText', false, text);
    } catch (error) {
      throw new InputInjectionError(`execCommand insertText threw: ${errorMessage(error)}`);
    }
  }

  function clickElement(el: Element, label: string): boolean {
    if (isDisabled(el)) return false;
    tryFocus(el, label);
    const click = (el as HTMLElement).click;
    if (typeof click !== 'function') return false;
    try {
      click.call(el);
      return true;
    } catch (error) {
      logEngine(`${label} click failed: ${errorMessage(error)}`);
      return false;
    }
  }

  function isDisabled(el: Element): boolean {
    const element = el as HTMLElement & { disabled?: boolean };
    return Boolean(
      element.disabled ||
        element.hasAttribute?.('disabled') ||
        element.getAttribute?.('aria-disabled') === 'true' ||
        element.getAttribute?.('data-disabled') === 'true',
    );
  }

  function dispatchEnter(input: Element): boolean {
    tryFocus(input, 'send input');
    const target = document.activeElement ?? input;
    if (dispatchEnterToTarget(target)) return true;
    if (target !== input) return dispatchEnterToTarget(input);
    return false;
  }

  function dispatchEnterToTarget(target: Element): boolean {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    try {
      const keydown = target.dispatchEvent(new KeyboardEvent('keydown', opts));
      const keypress = target.dispatchEvent(new KeyboardEvent('keypress', opts));
      const keyup = target.dispatchEvent(new KeyboardEvent('keyup', opts));
      if (!keydown || !keypress || !keyup) logEngine('enter event consumed by provider');
      return true;
    } catch (error) {
      logEngine(`enter dispatch failed: ${errorMessage(error)}`);
      return false;
    }
  }

  function tryFocus(el: Element, label: string): boolean {
    const focus = (el as HTMLElement).focus;
    if (typeof focus !== 'function') return false;
    try {
      focus.call(el);
      if (document.activeElement && document.activeElement !== el) {
        logEngine(`${label} focus did not become active`);
      }
      return true;
    } catch (error) {
      logEngine(`${label} focus failed: ${errorMessage(error)}`);
      return false;
    }
  }

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function logEngine(message: string) {
    try {
      console.info(`[MAC engine] ${message}`);
    } catch {
      // best effort diagnostic only
    }
  }
})();
