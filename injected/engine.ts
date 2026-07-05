import type { AIProvider, BridgeMessage } from '../shared/types';
import { buildReportDigest, type ReportElement } from './reportDigest';

type InputStrategyName = 'default' | 'prosemirror-paste' | 'quill-angular';
type SendStrategy = 'click' | 'enter';

interface DetectorObject {
  selector: string;
  textIncludes?: string;
  textExcludes?: string;
}

type Detector = string | DetectorObject;

interface AdapterConfig {
  provider: AIProvider;
  adapterVersion: number;
  inputSelectors: string[];
  sendButtonSelectors: string[];
  responseSelectors: string[];
  loginDetectors: string[];
  loggedOutDetectors?: string[];
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

type InputStrategy = (el: Element, text: string) => void | Promise<void>;

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
  let checkDoneInterval: number | undefined;
  let pollInterval: number | undefined;
  let lastSeenResponseEl: Element | null = null;
  let waitingForResponse = false;
  let lastResponseText = '';
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
      const payload = message.payload as { text?: string } | undefined;
      void sendMessage(payload?.text ?? '', message.provider);
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
    if (hasDetector(adapter.loggedOutDetectors)) {
      login = 'logged_out';
    } else if (hasDetector(adapter.loginDetectors)) {
      login = 'logged_in';
    } else if (adapter.provider === 'gemini' && location.hostname.includes('gemini.google.com')) {
      login = 'blocked';
    }
    bridge.emit({
      v: 1,
      action: 'STATUS_REPORT',
      provider: adapter.provider,
      payload: { dom: 'ready', login, thinking: isThinking(), bootId: bridge.bootId },
    });
  }

  async function sendMessage(text: string, providerHint?: AIProvider) {
    const activeAdapter = adapter;
    if (!activeAdapter) {
      doneWithError('adapter not installed', providerHint);
      return;
    }
    const input = await retryLookup(() => queryFirst(activeAdapter.inputSelectors), {
      intervalMs: SELECTOR_RETRY_INTERVAL_MS,
      timeoutMs: INPUT_SELECTOR_TIMEOUT_MS,
    });
    if (!input) {
      doneWithError(`${activeAdapter.provider} input element not found`, activeAdapter.provider);
      return;
    }

    const existingResponses = document.querySelectorAll(activeAdapter.responseSelectors.join(', '));
    lastSeenResponseEl = existingResponses.length > 0 ? existingResponses[existingResponses.length - 1] : null;
    waitingForResponse = true;
    lastResponseText = '';
    startResponsePolling();

    const injectionStartedAt = Date.now();
    try {
      await inputStrategies[activeAdapter.inputStrategy](input, text);
      assertInputLanded(input, text, activeAdapter.inputStrategy);
    } catch (error) {
      doneWithError(`${activeAdapter.provider} input injection failed: ${errorMessage(error)}`, activeAdapter.provider);
      return;
    }

    const preSendDelayMs = Math.max(0, PRE_SEND_DELAY_MS - (Date.now() - injectionStartedAt));
    window.setTimeout(() => {
      void (async () => {
        const firstAttempt = await activateSend(input);

        window.setTimeout(() => {
          void retrySendIfStillPending(input, firstAttempt, activeAdapter);
        }, SEND_RETRY_DELAY_MS);
      })();
    }, preSendDelayMs);
  }

  async function retrySendIfStillPending(originalInput: Element, firstAttempt: SendActivationResult, originalAdapter: AdapterConfig) {
    if (!waitingForResponse || !adapter) return;

    const currentResponses = document.querySelectorAll(adapter.responseSelectors.join(', '));
    const currentLastEl = currentResponses.length > 0 ? currentResponses[currentResponses.length - 1] : null;
    if (currentLastEl && currentLastEl !== lastSeenResponseEl) return;

    const currentInput = queryFirst(adapter.inputSelectors);
    const inputText = getInputText(currentInput).trim();
    if (!inputText) return;

    const retryInput = currentInput ?? originalInput;
    const retryAttempt = firstAttempt.ok
      ? await retryAfterSuccessfulAttempt(retryInput, firstAttempt)
      : await activateSend(retryInput);

    if (retryAttempt.ok) return;

    if (firstAttempt.ok) {
      logEngine(
        `${adapter?.provider ?? originalAdapter.provider} send retry failed after successful ${firstAttempt.path}: ${
          retryAttempt.detail ?? retryAttempt.path
        }`,
      );
      return;
    }

    doneWithError(
      `${originalAdapter.provider} send activation failed: ${retryAttempt.detail ?? firstAttempt.detail ?? retryAttempt.path}`,
      originalAdapter.provider,
    );
  }

  async function retryAfterSuccessfulAttempt(input: Element, firstAttempt: SendActivationResult): Promise<SendActivationResult> {
    const activeAdapter = adapter;
    if (!activeAdapter) return { ok: false, path: firstAttempt.path, detail: 'adapter not installed' };

    if (firstAttempt.path !== 'button-click' || activeAdapter.sendStrategy === 'enter') {
      logEngine(`${activeAdapter.provider} send retry skipped after successful ${firstAttempt.path}`);
      return { ok: true, path: firstAttempt.path, detail: 'retry skipped after successful send' };
    }

    const sendBtn = await retryLookup(() => queryFirst(activeAdapter.sendButtonSelectors), {
      intervalMs: SELECTOR_RETRY_INTERVAL_MS,
      timeoutMs: SEND_BUTTON_SELECTOR_TIMEOUT_MS,
    });
    if (!sendBtn) {
      logEngine(`${activeAdapter.provider} send retry skipped: send button not found`);
      return { ok: true, path: 'button-click', detail: 'retry skipped: send button not found' };
    }
    if (isDisabled(sendBtn)) {
      logEngine(`${activeAdapter.provider} send retry skipped: send button disabled`);
      return { ok: true, path: 'button-click', detail: 'retry skipped: send button disabled' };
    }

    const clicked = clickElement(sendBtn, `${activeAdapter.provider} retry send button`);
    logEngine(`${activeAdapter.provider} send retry path: button-click${clicked ? '' : ' failed'}`);
    return {
      ok: clicked,
      path: 'button-click',
      detail: clicked ? undefined : 'retry send button click failed',
    };
  }

  async function activateSend(input: Element): Promise<SendActivationResult> {
    const activeAdapter = adapter;
    if (!activeAdapter) return { ok: false, path: 'enter-key', detail: 'adapter not installed' };
    if (activeAdapter.sendStrategy !== 'enter') {
      const sendBtn = await retryLookup(() => queryFirst(activeAdapter.sendButtonSelectors), {
        intervalMs: SELECTOR_RETRY_INTERVAL_MS,
        timeoutMs: SEND_BUTTON_SELECTOR_TIMEOUT_MS,
      });
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

    const ok = dispatchEnter(input);
    logEngine(`${activeAdapter.provider} send path: enter-key${ok ? '' : ' failed'}`);
    return { ok, path: 'enter-key', detail: ok ? undefined : 'enter key dispatch failed' };
  }

  function defaultInjectInput(input: Element, text: string) {
    const el = input as HTMLElement;
    tryFocus(el, 'default input');

    if (input instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(input, text);
      else input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
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
      if (!execInsertText(text)) throw new InputInjectionError('execCommand insertText returned false');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function prosemirrorPasteInput(el: Element, text: string) {
    const editor = el as HTMLElement;
    tryFocus(editor, 'prosemirror editor');

    const paragraphs = editor.querySelectorAll('p');
    paragraphs.forEach((p) => p.remove());

    const p = document.createElement('p');
    p.textContent = text;
    editor.appendChild(p);
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    await sleep(100);
    try {
      tryFocus(editor, 'prosemirror paste');
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
      editor.dispatchEvent(pasteEvent);
    } catch (error) {
      logEngine(`prosemirror synthetic paste failed: ${errorMessage(error)}`);
      if (text.trim() && !getInputText(editor).trim()) {
        throw new InputInjectionError(`synthetic paste failed and editor is empty: ${errorMessage(error)}`);
      }
    }
  }

  async function quillAngularInput(el: Element, text: string) {
    const editor = el as HTMLElement;
    tryFocus(editor, 'quill editor');
    // Trusted-Types-safe clear: Gemini enforces Trusted Types (CSP), under which ANY innerHTML
    // assignment — even '' — throws "requires 'TrustedHTML' assignment". replaceChildren() removes
    // all children with no HTML parsing, so it never trips Trusted Types.
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
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));

    await sleep(150);
    if (!editor.textContent?.trim()) {
      tryFocus(editor, 'quill fallback');
      if (!execInsertText(text)) throw new InputInjectionError('quill fallback execCommand insertText returned false');
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }

  function getLatestResponseText(): string | null {
    if (!adapter) return null;
    const responseEls = document.querySelectorAll(adapter.responseSelectors.join(', '));
    if (responseEls.length === 0) return null;
    const lastEl = responseEls[responseEls.length - 1];
    if (waitingForResponse && lastSeenResponseEl && lastEl === lastSeenResponseEl) return null;
    const text = lastEl.textContent?.trim() ?? '';
    return text || null;
  }

  function isThinking(): boolean {
    return hasDetector(adapter?.thinkingDetectors);
  }

  function checkIfDone() {
    if (!waitingForResponse) return;
    if (isThinking()) {
      if (checkDoneInterval === undefined) {
        checkDoneInterval = window.setInterval(() => {
          if (!waitingForResponse) {
            clearCheckDone();
            return;
          }
          if (!isThinking()) {
            clearCheckDone();
            window.setTimeout(() => {
              const finalText = getLatestResponseText();
              if (finalText) lastResponseText = finalText;
              finishResponse();
            }, timing('doneDelayMs', 3000));
          }
        }, 1000);
      }
      return;
    }
    finishResponse();
  }

  function finishResponse() {
    if (!waitingForResponse || !adapter) return;
    waitingForResponse = false;
    clearTimersForResponse();
    bridge.emit({ v: 1, action: 'RESPONSE_DONE', provider: adapter.provider, payload: lastResponseText });
  }

  function doneWithError(reason: string, providerHint?: AIProvider) {
    const provider = providerHint ?? adapter?.provider;
    if (!provider) return;
    waitingForResponse = false;
    clearTimersForResponse();
    bridge.emit({ v: 1, action: 'RESPONSE_DONE', provider, payload: `[Error: ${reason}]` });
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
      lastResponseText = currentText;

      const now = Date.now();
      if (now - lastChunkTime >= timing('chunkDebounceMs', 500)) {
        lastChunkTime = now;
        if (adapter) bridge.emit({ v: 1, action: 'RESPONSE_CHUNK', provider: adapter.provider, payload: currentText });
      }
      if (responseTimeout !== undefined) window.clearTimeout(responseTimeout);
      responseTimeout = window.setTimeout(checkIfDone, timing('doneDelayMs', 3000));
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
      lastResponseText = currentText;
      if (adapter) bridge.emit({ v: 1, action: 'RESPONSE_CHUNK', provider: adapter.provider, payload: currentText });
      if (responseTimeout !== undefined) window.clearTimeout(responseTimeout);
      responseTimeout = window.setTimeout(checkIfDone, timing('doneDelayMs', 3000));
    }, timing('backupPollMs', 3000));
  }

  function clearCheckDone() {
    if (checkDoneInterval !== undefined) window.clearInterval(checkDoneInterval);
    checkDoneInterval = undefined;
  }

  function clearTimersForResponse() {
    if (responseTimeout !== undefined) window.clearTimeout(responseTimeout);
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
    if (getInputText(input).trim()) return;
    throw new InputInjectionError(`${strategy} left editor empty after injection`);
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
      return keydown !== false && keypress !== false && keyup !== false;
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
