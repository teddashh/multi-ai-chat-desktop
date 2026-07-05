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

(function engine() {
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

  const inputStrategies: Record<InputStrategyName, (el: Element, text: string) => void> = {
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
      sendMessage(payload?.text ?? '', message.provider);
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

  function sendMessage(text: string, providerHint?: AIProvider) {
    if (!adapter) {
      doneWithError('adapter not installed', providerHint);
      return;
    }
    const input = queryFirst(adapter.inputSelectors);
    if (!input) {
      doneWithError(`${adapter.provider} input element not found`);
      return;
    }

    const existingResponses = document.querySelectorAll(adapter.responseSelectors.join(', '));
    lastSeenResponseEl = existingResponses.length > 0 ? existingResponses[existingResponses.length - 1] : null;
    waitingForResponse = true;
    lastResponseText = '';
    startResponsePolling();

    try {
      inputStrategies[adapter.inputStrategy](input, text);
    } catch (error) {
      doneWithError(`input injection failed: ${String(error)}`);
      return;
    }

    window.setTimeout(() => {
      activateSend(input);
      window.setTimeout(() => {
        if (!waitingForResponse || !adapter) return;
        const currentResponses = document.querySelectorAll(adapter.responseSelectors.join(', '));
        const currentLastEl = currentResponses.length > 0 ? currentResponses[currentResponses.length - 1] : null;
        if (currentLastEl && currentLastEl !== lastSeenResponseEl) return;

        const currentInput = queryFirst(adapter.inputSelectors);
        const inputText = getInputText(currentInput).trim();
        if (!inputText) return;
        activateSend(currentInput ?? input);
      }, 1500);
    }, 800);
  }

  function activateSend(input: Element) {
    if (!adapter) return;
    const sendBtn = adapter.sendStrategy !== 'enter' ? queryFirst(adapter.sendButtonSelectors) : null;
    if (sendBtn) {
      (sendBtn as HTMLElement).click();
      return;
    }
    const target = (document.activeElement as Element | null) ?? input;
    (target as HTMLElement).focus?.();
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function defaultInjectInput(input: Element, text: string) {
    const el = input as HTMLElement;
    el.focus();

    if (input instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function prosemirrorPasteInput(el: Element, text: string) {
    const editor = el as HTMLElement;
    editor.focus();

    const paragraphs = editor.querySelectorAll('p');
    paragraphs.forEach((p) => p.remove());

    const p = document.createElement('p');
    p.textContent = text;
    editor.appendChild(p);
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges();
      selection?.addRange(range);

      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(pasteEvent);
    }, 100);
  }

  function quillAngularInput(el: Element, text: string) {
    const editor = el as HTMLElement;
    editor.focus();
    editor.innerHTML = '';

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

    setTimeout(() => {
      if (!editor.textContent?.trim()) {
        editor.focus();
        document.execCommand('insertText', false, text);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    }, 150);
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
    const provider = adapter?.provider ?? providerHint;
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
})();
