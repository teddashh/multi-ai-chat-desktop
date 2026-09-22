import type { AIProvider, BridgeMessage } from '../shared/types';
import { isProviderChallengeActive } from './challenge';
import { buildReportDigest, type ReportElement } from './reportDigest';
import { finalResponseText, serializeResponseText } from './responseSerializer';

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
const CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS = 10_000;
const CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS = 4_000;
const CHATGPT_USER_MESSAGE_SELECTORS = [
  '[data-message-author-role="user"]',
  '[data-testid="user-message"]',
  'div[id^="response-"].items-end',
  '.message-bubble.user',
];
const CHATGPT_USER_MESSAGE_SELECTOR = CHATGPT_USER_MESSAGE_SELECTORS.join(', ');
const CHATGPT_LIVE_SEND_BUTTON_SELECTORS = [
  'button[data-testid="composer-submit-button"]',
  'button[aria-label="Send message"]',
];
const CHATGPT_COLLAPSED_PROMPT_MIN_SOURCE_CHARS = 512;
const CHATGPT_COLLAPSED_PROMPT_MIN_VISIBLE_CHARS = 80;
const CHATGPT_COLLAPSED_PROMPT_PREFIX_CHARS = 160;
const GROK_LIVE_STOP_BUTTON_SELECTOR = 'button[data-testid="chat-stop-button"]';
const GROK_LIVE_TEXTAREA_SELECTORS = [
  '[data-testid="chat-input"] textarea[aria-label="Ask Grok anything"]',
  'textarea[aria-label="Ask Grok anything"]',
  '[data-testid="chat-input"] textarea',
];
const CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS = 400;
const CHATGPT_TERMINAL_MIN_STABLE_MS = 1200;
const CHATGPT_TERMINAL_MIN_SAMPLES = 3;
const DOCUMENT_POSITION_DISCONNECTED = 0x01;
const DOCUMENT_POSITION_FOLLOWING = 0x04;
const USER_MESSAGE_ANCESTOR_SELECTOR = [
  '[data-message-author-role="user"]',
  '[data-testid="user-message"]',
  'div[id^="response-"].items-end',
  '.message-bubble.user',
].join(', ');

// A finished ChatGPT turn grows a copy button, without needing hover. The stop button is removed
// before the last render batch lands, and multi-step answers (search, reasoning) can drop it
// entirely during an intermediate pause, so relying on it alone reads a pause as "finished".
// This second signal covers the window the stop button cannot see.
//
// This lives in the engine rather than the adapter JSON on purpose: thinkingDetectors is a flat
// selector array that cannot express "the last turn is missing this element", and its seed values
// are pinned by the SPEC 5.1 frozen table and by scripts/check-adapters.mjs.
const TURN_COMPLETION_SIGNALS: Partial<Record<AIProvider, { turn: string; complete: string }>> = {
  chatgpt: {
    turn: '[data-testid^="conversation-turn-"]',
    complete: '[data-testid="copy-turn-action-button"]',
  },
};

const CHATGPT_STRONG_ACTIVITY_SELECTORS = [
  '[aria-busy="true"]',
  '[data-streaming="true"]',
  '[data-is-streaming="true"]',
  'span.loading-shimmer',
  '.loading-shimmer',
  '[class*="loading-shimmer"]',
];
const CHATGPT_PROGRESS_SELECTORS = ['[role="progressbar"]', 'progress'];
const CHATGPT_EXTERNAL_STATUS_SELECTORS = ['[role="status"]'];
const CHATGPT_EXTERNAL_LIVE_REGION_SELECTORS = ['[aria-live]'];
const CHATGPT_VERIFIED_SIDECAR_SELECTORS = ['[data-testid*="thinking"]', '[data-testid*="reasoning"]'];
const CHATGPT_TURN_STATUS_SELECTORS = [
  ...CHATGPT_EXTERNAL_STATUS_SELECTORS,
  ...CHATGPT_EXTERNAL_LIVE_REGION_SELECTORS,
  ...CHATGPT_VERIFIED_SIDECAR_SELECTORS,
  '[class*="thinking"]',
  '[class*="reasoning"]',
];
const CHATGPT_PLAIN_ACTIVITY_ELEMENT_SELECTORS = ['div', 'span', 'p'];
// The current ChatGPT Pro surface renders this observed live phase as plain text without a
// durable role/class. Keep this fallback intentionally literal: answer prose can legitimately
// contain generic words such as "Planning" or "Working" and must not become a busy signal.
const CHATGPT_PLAIN_ACTIVITY_LABELS = ['pro thinking'];
const CHATGPT_ACTIVE_STATUS_LABELS = [
  'thinking',
  'pro thinking',
  'thinking longer for a better answer',
  'reasoning',
  'finalizing answer',
  'finalizing',
  'analyzing',
  'researching',
  'working on it',
  'working',
  'planning',
  'searching the web',
  'searching',
  'reading',
];
const CHATGPT_EXTERNAL_ACTIVE_STATUS_LABELS = [
  'thinking',
  'pro thinking',
  'thinking longer for a better answer',
  'reasoning',
  'finalizing answer',
  'finalizing',
];
const CHATGPT_STRONG_STOP_SELECTORS = [
  '[data-testid="stop-button"]',
  'button[data-testid="composer-stop-button"]',
  'button[aria-label="Stop generating"]',
  'button[aria-label="Stop streaming"]',
  'button[aria-label="Stop"]',
];

// Fail closed after the shipped 10-minute inactivity window if the positive completion signal
// never arrives. A selector rename must surface a retryable error instead of silently returning a
// partial answer, while fresh response text or the ordinary thinking detectors keep the wait alive.
const TURN_COMPLETION_CONFIRM_TIMEOUT_MS = 600_000;

interface ChatGptTerminalGateState {
  turn: Element | null;
  response: Element | null;
  completion: Element | null;
  responseText: string;
  stableSince: number;
  samples: number;
}

interface ResponseCandidate {
  element: Element;
  text: string;
}

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
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[^\r\n]*[\r\n]?/g, '')
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
  let responseBaselineTextCounts = new Map<string, number>();
  let waitingForResponse = false;
  let responseGeneration = 0;
  let activeResponseGeneration = 0;
  let nextSendOperation = 0;
  let activeSendOperation: number | undefined;
  let draftStaging = false;
  let lastResponseText = '';
  let lastCompletionActivityAt = 0;
  let lastGrokThinking: boolean | undefined;
  let pendingPromptText = '';
  let matchingChatGptUserTurnBaseline = 0;
  let activeChatGptUserTurnAnchor: Element | null = null;
  let chatGptPreSendUserTurns: Element[] = [];
  // True after this wait has adopted a post-baseline user turn, even if that node later detaches.
  let chatGptUserTurnAnchorLatched = false;
  // Latched only after generation is seen while this wait's baseline is already snapshotted.
  let chatGptResponseGenerationObserved = false;
  let lastChunkTime = 0;
  let lastActivatedInput: Element | null = null;
  let chatGptTerminalGate: ChatGptTerminalGateState = emptyChatGptTerminalGate();

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

  function syncFillTitleTurn(): Promise<void> {
    // emitTitleNow queues emitTitleFrame on titleEmitChain. Every strategy performs its first
    // composer mutation before its own first await, so the queued title write has to take this
    // turn first. Otherwise a wedge inside that mutation emits neither fill:start nor fill:done.
    return Promise.resolve();
  }

  function emitComposerFill(phase: 'start' | 'done', fillChars: number, fillMs?: number): void {
    try {
      if (typeof bridge.emitTitle !== 'function') return;
      const payload: { fill: 'start' | 'done'; fillChars: number; fillMs?: number; bootId: string } = {
        fill: phase,
        fillChars,
        bootId: bridge.bootId,
      };
      if (fillMs !== undefined) payload.fillMs = fillMs;
      bridge.emitTitle('STATUS_REPORT', payload, { immediate: true });
    } catch {
      // best effort diagnostic only
    }
  }

  bridge.onDispatch((message: BridgeMessage) => {
    if (message.action === 'ADAPTER_UPDATE') {
      installAdapter(message.payload as AdapterConfig);
      return;
    }
    if (message.action === 'SEND_MESSAGE' && (!adapter || !message.provider || message.provider === adapter.provider)) {
      const sendOperation = beginSendOperation(message.provider);
      if (sendOperation === undefined) return;
      if (abortAutomationForChallenge(message.provider, true, 'send', sendOperation)) return;
      if (rejectSendWhileProviderGenerating(message.provider, sendOperation)) return;
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

  function queryFirstVisible(selectors: string[] = []): Element | null {
    for (const selector of selectors) {
      const matches = document.querySelectorAll(selector);
      for (const match of matches) {
        if (isElementVisible(match)) return match;
      }
      // Lightweight test/fallback DOMs may implement querySelector without querySelectorAll.
      const first = document.querySelector(selector);
      if (first && isElementVisible(first)) return first;
    }
    return null;
  }

  function queryLastVisible(selectors: string[] = []): Element | null {
    const visible: Element[] = [];
    for (const selector of selectors) {
      const matches = Array.from(document.querySelectorAll(selector));
      const first = document.querySelector(selector);
      if (first && !matches.includes(first)) matches.push(first);
      for (const match of matches) {
        if (isElementVisible(match) && !visible.includes(match)) visible.push(match);
      }
    }
    let latest: Element | null = null;
    for (const candidate of visible) {
      if (!latest || elementFollows(latest, candidate) || !elementFollows(candidate, latest)) {
        latest = candidate;
      }
    }
    return latest;
  }

  function isElementVisible(element: Element): boolean {
    const html = element as HTMLElement;
    if (html.hidden || html.getAttribute?.('aria-hidden') === 'true') return false;
    try {
      const getComputedStyle = (window as Window & typeof globalThis).getComputedStyle;
      if (typeof getComputedStyle === 'function') {
        const style = getComputedStyle(element);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          (style.opacity !== '' && Number(style.opacity) === 0)
        ) {
          return false;
        }
      }
    } catch {
      // Treat an element as visible when a provider's custom element rejects style inspection.
    }
    try {
      const getClientRects = (element as HTMLElement).getClientRects;
      if (typeof getClientRects === 'function' && getClientRects.call(element).length === 0) return false;
    } catch {
      // A detached/custom element is handled by the provider's normal selector lifecycle.
    }
    return true;
  }

  function queryFirstUsable(selectors: string[] = []): Element | null {
    for (const selector of selectors) {
      const matches = document.querySelectorAll(selector);
      for (const match of matches) {
        if (isComposerUsable(match)) return match;
      }
    }
    return null;
  }

  function isComposerUsable(element: Element): boolean {
    const html = element as HTMLElement & { disabled?: boolean; readOnly?: boolean; inert?: boolean };
    return (
      isElementVisible(element) &&
      !isDisabled(element) &&
      !html.readOnly &&
      !html.hasAttribute('readonly') &&
      html.getAttribute('aria-readonly') !== 'true' &&
      !html.inert &&
      !element.closest('[inert]')
    );
  }

  function queryInput(activeAdapter: AdapterConfig): Element | null {
    if (activeAdapter.provider === 'grok') {
      return queryLastVisible([...GROK_LIVE_TEXTAREA_SELECTORS, ...activeAdapter.inputSelectors]);
    }
    if (activeAdapter.provider === 'meta') {
      return queryFirstUsable(activeAdapter.inputSelectors);
    }
    return queryFirst(activeAdapter.inputSelectors);
  }

  function stop() {
    try {
      if (adapter && !abortAutomationForChallenge(adapter.provider, false, 'stop')) {
        const liveGrokButton =
          adapter.provider === 'grok' ? queryFirstVisible([GROK_LIVE_STOP_BUTTON_SELECTOR]) : null;
        const button = liveGrokButton ?? queryFirstVisible(adapter.stopButtonSelectors ?? []);
        (button as HTMLElement | null)?.click?.();
      }
    } catch {
      // best effort
    } finally {
      // The host already completed its waiter when it calls stop after a timeout. Release the
      // page-side generation too, or beginSendOperation() rejects every later Retry until reload.
      cancelResponseWait();
      activeSendOperation = undefined;
      draftStaging = false;
    }
  }

  function hasDetector(detectors: Detector[] = []): boolean {
    for (const detector of detectors) {
      const selector = typeof detector === 'string' ? detector : detector.selector;
      const matches = Array.from(document.querySelectorAll(selector));
      const first = document.querySelector(selector);
      if (first && !matches.includes(first)) matches.push(first);
      for (const element of matches) {
        if (!isElementVisible(element)) continue;
        if (typeof detector === 'string') return true;
        const text = element.textContent ?? '';
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
    } else if (adapter.provider === 'meta' && queryInput(adapter) !== null) {
      // A usable composer wins. After Facebook/Instagram login the page can still
      // expose a login control or an inert prehydration field beside the real editor.
      login = 'logged_in';
    } else if (hasDetector(adapter.loggedOutDetectors) || adapter.provider === 'meta') {
      // Meta does not treat a visible but gated composer, or Send alone, as logged in.
      login = 'logged_out';
    } else if (
      hasDetector(adapter.loginDetectors) ||
      (adapter.provider === 'grok' &&
        (queryInput(adapter) !== null || queryFirstVisible([GROK_LIVE_STOP_BUTTON_SELECTOR]) !== null))
    ) {
      login = 'logged_in';
    } else if (adapter.provider === 'gemini' && location.hostname === 'gemini.google.com') {
      login = 'blocked';
    }
    bridge.emit({
      v: 1,
      action: 'STATUS_REPORT',
      provider: adapter.provider,
      payload: { dom: 'ready', login, thinking: isGenerating(), bootId: bridge.bootId },
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
    const input = await retryLookup(() => queryInput(activeAdapter), {
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
    if (sendOperation !== undefined && rejectSendWhileProviderGenerating(activeAdapter.provider, sendOperation)) {
      return undefined;
    }

    const existingResponses = document.querySelectorAll(activeAdapter.responseSelectors.join(', '));
    lastSeenResponseEl = existingResponses.length > 0 ? existingResponses[existingResponses.length - 1] : null;
    responseBaselineEls = new Set(existingResponses);
    responseBaselineTextCounts = countResponseTextKeys(Array.from(existingResponses));
    responseGeneration += 1;
    activeResponseGeneration = responseGeneration;
    waitingForResponse = true;
    lastResponseText = '';
    lastCompletionActivityAt = Date.now();
    pendingPromptText = text;
    chatGptPreSendUserTurns = matchingChatGptUserTurns(activeAdapter, text);
    matchingChatGptUserTurnBaseline = chatGptPreSendUserTurns.length;
    activeChatGptUserTurnAnchor = null;
    chatGptUserTurnAnchorLatched = false;
    chatGptResponseGenerationObserved = false;
    lastActivatedInput = null;
    resetChatGptTerminalGate();
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
      const fillChars = text.length;
      emitComposerFill('start', fillChars);
      const fillStartedAt = Date.now();
      await syncFillTitleTurn();
      assertCanMutate();
      await inputStrategies[activeAdapter.inputStrategy](input, text, assertCanMutate);
      emitComposerFill('done', fillChars, Math.max(0, Date.now() - fillStartedAt));
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
        const firstAttempt = await activateSend(input, sendOperation, true);

        if (!isActiveSendOperation(sendOperation) || !waitingForResponse) return;
        window.setTimeout(() => {
          void retrySendIfStillPending(input, firstAttempt, activeAdapter, sendOperation);
        }, initialSendConfirmationDelay(activeAdapter));
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
    if (adapter.provider === 'chatgpt' && providerStillGeneratingBeforeSend(adapter.provider)) {
      logEngine('chatgpt retry suppressed: native generation became visible');
      return;
    }

    const currentInput = queryInput(adapter);
    if (!currentInput) {
      if (adapter.provider === 'chatgpt') {
        doneWithError(
          'chatgpt send could not be confirmed; composer disappeared before a matching user turn appeared',
          originalAdapter.provider,
          sendOperation,
        );
        return;
      }
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
    if (!inputText) {
      if (adapter.provider === 'chatgpt') {
        doneWithError(
          'chatgpt send could not be confirmed; composer cleared before a matching user turn appeared',
          originalAdapter.provider,
          sendOperation,
        );
      }
      return;
    }

    if (adapter.provider === 'chatgpt' && !composerTextMatches(currentInput, pendingPromptText)) {
      doneWithError(
        'chatgpt send could not be confirmed; composer changed before a matching user turn appeared',
        originalAdapter.provider,
        sendOperation,
      );
      return;
    }

    if (adapter.provider !== 'chatgpt' && firstAttempt.ok && firstAttempt.path === 'button-click') {
      const firstButton = querySendButton(adapter, currentInput);
      if (!firstButton || isDisabled(firstButton)) return;
    }

    const retryInput = currentInput ?? originalInput;
    const retryAttempt = await activateSend(retryInput, sendOperation, false);
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
    }, fallbackSendConfirmationDelay(originalAdapter));
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
    if (activeAdapter.provider === 'chatgpt' && providerStillGeneratingBeforeSend(activeAdapter.provider)) {
      logEngine('chatgpt final send fallback suppressed: native generation is visible');
      return;
    }

    const currentInput = queryInput(activeAdapter);
    if (!currentInput) {
      if (activeAdapter.provider === 'chatgpt') {
        doneWithError(
          'chatgpt send could not be confirmed; composer disappeared before a matching user turn appeared',
          activeAdapter.provider,
          sendOperation,
        );
      }
      return;
    }

    if (activeAdapter.provider === 'chatgpt' && !composerTextMatches(currentInput, pendingPromptText)) {
      doneWithError(
        `chatgpt send could not be confirmed; composer ${getInputText(currentInput).trim() ? 'changed' : 'cleared'} before a matching user turn appeared`,
        activeAdapter.provider,
        sendOperation,
      );
      return;
    }

    const sendButton = querySendButton(activeAdapter, currentInput);
    if (
      activeAdapter.provider !== 'chatgpt' &&
      retryAttempt.path === 'button-click' &&
      (!sendButton || isDisabled(sendButton))
    ) {
      return;
    }
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
      const finalInput = queryInput(adapter);
      if (adapter.provider === 'chatgpt') {
        if (finalInput && composerTextMatches(finalInput, pendingPromptText)) {
          doneWithError(
            'chatgpt send was not accepted; draft is still in composer',
            adapter.provider,
            sendOperation,
          );
        } else {
          const composerState = finalInput
            ? getInputText(finalInput).trim()
              ? 'changed'
              : 'cleared'
            : 'disappeared';
          doneWithError(
            `chatgpt send could not be confirmed; composer ${composerState} before a matching user turn appeared`,
            adapter.provider,
            sendOperation,
          );
        }
        return;
      }
      const finalButton = finalInput ? querySendButton(adapter, finalInput) : null;
      if (!finalInput || !getInputText(finalInput).trim()) return;
      if (hadSendButton && (!finalButton || isDisabled(finalButton))) return;
      doneWithError(
        `${adapter.provider} send was not accepted; draft is still in composer`,
        adapter.provider,
        sendOperation,
      );
    }, fallbackSendConfirmationDelay(originalAdapter));
  }

  async function activateSend(
    input: Element,
    sendOperation: number,
    allowComposerRestore: boolean,
  ): Promise<SendActivationResult> {
    if (!isActiveSendOperation(sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'send operation is no longer active' };
    }
    const activeAdapter = adapter;
    if (!activeAdapter) return { ok: false, path: 'enter-key', detail: 'adapter not installed' };
    if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'security challenge is active' };
    }
    let liveInput = await prepareLiveInputForSend(input, activeAdapter, sendOperation, allowComposerRestore);
    if (!allowComposerRestore && sendStarted(activeAdapter)) {
      return { ok: true, path: 'button-click', detail: 'send confirmed while preparing retry' };
    }
    if (!liveInput) {
      return { ok: false, path: 'enter-key', detail: 'live composer is unavailable' };
    }
    if (allowComposerRestore && rejectSendWhileProviderGenerating(activeAdapter.provider, sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'provider resumed generation before activation' };
    }
    if (activeAdapter.sendStrategy !== 'enter') {
      let sendBtn = await retryLookup(
        () => (liveInput ? querySendButton(activeAdapter, liveInput) : null),
        {
        intervalMs: SELECTOR_RETRY_INTERVAL_MS,
        timeoutMs: SEND_BUTTON_SELECTOR_TIMEOUT_MS,
        },
      );
      if (!isActiveSendOperation(sendOperation)) {
        return { ok: false, path: 'enter-key', detail: 'send operation is no longer active' };
      }
      if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) {
        return { ok: false, path: 'enter-key', detail: 'security challenge is active' };
      }
      if (!allowComposerRestore && sendStarted(activeAdapter)) {
        return { ok: true, path: 'button-click', detail: 'send confirmed during retry lookup' };
      }
      if (allowComposerRestore && rejectSendWhileProviderGenerating(activeAdapter.provider, sendOperation)) {
        return { ok: false, path: 'button-click', detail: 'provider resumed generation before activation' };
      }
      const revalidatedInput = await prepareLiveInputForSend(
        liveInput,
        activeAdapter,
        sendOperation,
        allowComposerRestore,
      );
      if (!revalidatedInput) {
        return { ok: false, path: 'button-click', detail: 'live composer changed before activation' };
      }
      if (revalidatedInput !== liveInput) {
        liveInput = revalidatedInput;
        sendBtn = querySendButton(activeAdapter, liveInput);
      }
      if (sendBtn) {
        if (isDisabled(sendBtn)) {
          logEngine(`${activeAdapter.provider} send path: send button disabled; falling back to enter`);
        } else {
          if (allowComposerRestore && rejectSendWhileProviderGenerating(activeAdapter.provider, sendOperation)) {
            return { ok: false, path: 'button-click', detail: 'provider resumed generation before activation' };
          }
          lastActivatedInput = liveInput;
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
    if (!allowComposerRestore && sendStarted(activeAdapter)) {
      return { ok: true, path: 'enter-key', detail: 'send confirmed before retry fallback' };
    }
    const revalidatedInput = await prepareLiveInputForSend(
      liveInput,
      activeAdapter,
      sendOperation,
      allowComposerRestore,
    );
    if (!revalidatedInput) {
      return { ok: false, path: 'enter-key', detail: 'live composer changed before activation' };
    }
    liveInput = revalidatedInput;
    if (allowComposerRestore && rejectSendWhileProviderGenerating(activeAdapter.provider, sendOperation)) {
      return { ok: false, path: 'enter-key', detail: 'provider resumed generation before activation' };
    }
    lastActivatedInput = liveInput;
    const ok = dispatchEnter(liveInput);
    logEngine(`${activeAdapter.provider} send path: enter-key${ok ? '' : ' failed'}`);
    return { ok, path: 'enter-key', detail: ok ? undefined : 'enter key dispatch failed' };
  }

  async function prepareLiveInputForSend(
    stagedInput: Element,
    activeAdapter: AdapterConfig,
    sendOperation: number,
    allowComposerRestore: boolean,
  ): Promise<Element | null> {
    if (!['chatgpt', 'grok', 'meta'].includes(activeAdapter.provider)) return stagedInput;
    const provider = activeAdapter.provider;
    const liveInput = await retryLookup(() => queryInput(activeAdapter), {
      intervalMs: SELECTOR_RETRY_INTERVAL_MS,
      timeoutMs: INPUT_SELECTOR_TIMEOUT_MS,
    });
    if (!isActiveSendOperation(sendOperation) || !waitingForResponse) return null;
    if (allowComposerRestore && rejectSendWhileProviderGenerating(activeAdapter.provider, sendOperation)) {
      return null;
    }
    if (!liveInput) {
      if (allowComposerRestore) {
        doneWithError(`${provider} input disappeared before send`, provider, sendOperation);
      }
      return null;
    }
    if (!allowComposerRestore && sendStarted(activeAdapter)) return liveInput;
    if (composerTextMatches(liveInput, pendingPromptText)) return liveInput;
    if (getInputText(liveInput).trim()) {
      doneWithError(`${provider} composer changed before send`, provider, sendOperation);
      return null;
    }
    if (!allowComposerRestore) return null;

    const assertCanMutate = () => {
      if (!isActiveSendOperation(sendOperation)) throw new InactiveSendOperationError();
      if (abortAutomationForChallenge(activeAdapter.provider, true, 'send', sendOperation)) {
        throw new ChallengeActiveError();
      }
    };
    try {
      assertCanMutate();
      const fillChars = pendingPromptText.length;
      emitComposerFill('start', fillChars);
      const fillStartedAt = Date.now();
      await syncFillTitleTurn();
      assertCanMutate();
      await inputStrategies[activeAdapter.inputStrategy](liveInput, pendingPromptText, assertCanMutate);
      emitComposerFill('done', fillChars, Math.max(0, Date.now() - fillStartedAt));
      assertCanMutate();
      assertInputLanded(liveInput, pendingPromptText, activeAdapter.inputStrategy);
      logEngine(`${provider} send path: restored prompt into remounted composer`);
      return liveInput;
    } catch (error) {
      if (error instanceof ChallengeActiveError || error instanceof InactiveSendOperationError) return null;
      doneWithError(
        `${provider} live composer injection failed: ${errorMessage(error)}`,
        provider,
        sendOperation,
      );
      return null;
    }
  }

  function defaultInjectInput(input: Element, text: string, assertCanMutate: ChallengeMutationGuard) {
    const el = input as HTMLElement;
    assertCanMutate();
    tryFocus(el, 'default input');
    assertCanMutate();

    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const inputPrototype = input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(inputPrototype, 'value')?.set;
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

    // Grok currently serves both ProseMirror and native textarea composer cohorts. The adapter's
    // frozen seed still names the ProseMirror strategy, so route a live textarea through React's
    // native value setter instead of trying to paste/replace DOM children inside it.
    if (el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      assertCanMutate();
      if (setter) setter.call(el, text);
      else el.value = text;
      assertCanMutate();
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      assertCanMutate();
      return;
    }

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
    return getLatestResponseCandidate()?.text ?? null;
  }

  function getLatestResponseCandidate(): ResponseCandidate | null {
    if (!adapter) return null;
    noteChatGptResponseGeneration();
    const chatGptAnchor = adapter.provider === 'chatgpt' ? refreshChatGptUserTurnAnchor(adapter) : null;
    // A missing anchor used to hard-stop ChatGPT reads. After generation has been seen, fall
    // through to the baseline filters below instead of staying silent.
    if (adapter.provider === 'chatgpt' && !chatGptAnchor && !chatGptMayReadResponseWithoutAnchor()) return null;
    const responseEls = Array.from(document.querySelectorAll(adapter.responseSelectors.join(', ')));
    if (responseEls.length === 0) return null;
    for (let index = responseEls.length - 1; index >= 0; index -= 1) {
      const response = responseEls[index];
      if (chatGptAnchor && !elementFollows(chatGptAnchor, response)) continue;
      if (!chatGptAnchor && waitingForResponse && responseBaselineEls.has(response)) continue;
      if (isUserMessageElement(response)) continue;
      const text = extractResponseText(response);
      if (!chatGptAnchor && waitingForResponse && text && !responseTextIsBeyondBaseline(text, responseEls)) continue;
      if (text && !isLikelyPromptEcho(text, pendingPromptText)) return { element: response, text };
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

  function loadedGeneratedMedia(response: Element): Element | null {
    const responseTag = typeof response.tagName === 'string' ? response.tagName.toUpperCase() : '';
    const candidates: Element[] = ['IMG', 'CANVAS', 'VIDEO'].includes(responseTag) ? [response] : [];
    for (const media of Array.from(response.querySelectorAll?.('img, canvas, video') ?? [])) {
      if (!candidates.includes(media)) candidates.push(media);
    }
    const first = response.querySelector?.('img, canvas, video') ?? null;
    if (first && !candidates.includes(first)) candidates.push(first);
    return candidates.find((media) => isElementVisible(media) && generatedMediaIsLoaded(media)) ?? null;
  }

  function generatedMediaIsLoaded(media: Element): boolean {
    const tag = typeof media.tagName === 'string' ? media.tagName.toUpperCase() : '';
    if (tag === 'IMG') {
      const image = media as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    }
    if (tag === 'CANVAS') {
      const canvas = media as HTMLCanvasElement;
      return canvas.width > 0 && canvas.height > 0;
    }
    if (tag === 'VIDEO') {
      return (media as HTMLVideoElement).readyState >= 1;
    }
    return false;
  }

  function chatGptCompletionEvidence(turn: Element, response: ResponseCandidate): Element | null {
    const signal = TURN_COMPLETION_SIGNALS.chatgpt;
    const copyMarker = signal ? queryFirstVisibleWithin(turn, [signal.complete]) : null;
    if (copyMarker) return copyMarker;
    return response.text.startsWith('[Image generated') ? loadedGeneratedMedia(response.element) : null;
  }

  function queryFirstVisibleWithin(root: Element, selectors: string[]): Element | null {
    for (const selector of selectors) {
      const matches = Array.from(root.querySelectorAll(selector));
      const first = root.querySelector(selector);
      if (first && !matches.includes(first)) matches.push(first);
      for (const match of matches) {
        if (isElementVisible(match)) return match;
      }
    }
    return null;
  }

  function currentChatGptCompletionTurn(responseElement?: Element): Element | null {
    if (!adapter || adapter.provider !== 'chatgpt') return null;
    const signal = TURN_COMPLETION_SIGNALS.chatgpt;
    if (!signal) return null;
    noteChatGptResponseGeneration();
    const anchor = refreshChatGptUserTurnAnchor(adapter);
    if (!anchor && !chatGptMayReadResponseWithoutAnchor()) return null;
    const response = responseElement ?? getLatestResponseCandidate()?.element;
    if (!response) return null;
    const eligibleTurns = Array.from(document.querySelectorAll(signal.turn)).filter(
      (turn) => elementContains(turn, response) && (!anchor || elementFollows(anchor, turn)),
    );
    return eligibleTurns.length > 0 ? eligibleTurns[eligibleTurns.length - 1] : null;
  }

  function elementContains(container: Element, candidate: Element): boolean {
    if (container === candidate) return true;
    const contains = (container as Element & { contains?: (node: Node | null) => boolean }).contains;
    if (typeof contains === 'function') {
      try {
        return contains.call(container, candidate);
      } catch {
        return false;
      }
    }
    const closest = (candidate as Element & { closest?: (selector: string) => Element | null }).closest;
    if (typeof closest !== 'function') return false;
    try {
      return closest.call(candidate, TURN_COMPLETION_SIGNALS.chatgpt?.turn ?? '') === container;
    } catch {
      return false;
    }
  }

  function latestChatGptTurn(): Element | null {
    const signal = TURN_COMPLETION_SIGNALS.chatgpt;
    if (!signal) return null;
    const turns = Array.from(document.querySelectorAll(signal.turn));
    if (adapter?.provider === 'chatgpt') {
      const responses = Array.from(document.querySelectorAll(adapter.responseSelectors.join(', ')));
      const latestResponse = responses.length > 0 ? responses[responses.length - 1] : null;
      if (latestResponse) {
        for (let index = turns.length - 1; index >= 0; index -= 1) {
          const turn = turns[index];
          if (turn && elementContains(turn, latestResponse)) return turn;
        }
      }
    }
    return turns.length > 0 ? turns[turns.length - 1] : null;
  }

  function chatGptHasStrongActivity(turn?: Element | null): boolean {
    const activeTurn = turn ?? latestChatGptTurn();
    if (queryFirstVisible(CHATGPT_STRONG_STOP_SELECTORS)) return true;
    if (activeTurn && queryFirstVisibleWithin(activeTurn, CHATGPT_STRONG_ACTIVITY_SELECTORS)) return true;
    if (activeTurn && chatGptTurnHasActiveProgress(activeTurn)) return true;
    if (chatGptHasPlainActivityLabel(activeTurn)) return true;
    if (chatGptHasStrongExternalSidecarActivity(activeTurn)) return true;
    return chatGptHasActiveStatusLabel(activeTurn);
  }

  function chatGptHasPlainActivityLabel(turn?: Element | null): boolean {
    const activeTurn = turn ?? latestChatGptTurn();
    if (!activeTurn) return false;
    // Before a new SEND, a visible copy control makes the latest turn conclusively historical.
    // During an active wait ChatGPT can expose that control between Astra phases while the plain
    // "Pro thinking" label is still live, so do not let the marker end that in-flight phase.
    const completionSelector = TURN_COMPLETION_SIGNALS.chatgpt?.complete;
    const promptAnchor =
      adapter?.provider === 'chatgpt' ? refreshChatGptUserTurnAnchor(adapter) : activeChatGptUserTurnAnchor;
    const belongsToPendingPrompt = Boolean(
      promptAnchor && elementFollows(promptAnchor, activeTurn),
    );
    if (
      completionSelector &&
      (!waitingForResponse || !belongsToPendingPrompt) &&
      queryFirstVisibleWithin(activeTurn, [completionSelector])
    ) {
      return false;
    }
    for (const selector of CHATGPT_PLAIN_ACTIVITY_ELEMENT_SELECTORS) {
      for (const element of Array.from(activeTurn.querySelectorAll(selector))) {
        if (!isElementVisible(element)) continue;
        const label = normalizeActivityLabel(element.textContent ?? '');
        if (!label || label.length > 80 || chatGptStatusLabelIsCompleted(label)) continue;
        if (CHATGPT_PLAIN_ACTIVITY_LABELS.includes(label)) return true;
      }
    }
    return false;
  }

  function chatGptHasStrongExternalSidecarActivity(turn?: Element | null): boolean {
    for (const selector of CHATGPT_VERIFIED_SIDECAR_SELECTORS) {
      const matches = Array.from(document.querySelectorAll(selector));
      const first = document.querySelector(selector);
      if (first && !matches.includes(first)) matches.push(first);
      for (const sidecar of matches) {
        if (
          !isElementVisible(sidecar) ||
          !chatGptExternalStatusBelongsToConversation(sidecar, turn)
        ) {
          continue;
        }
        if (elementHasStrongActivitySignal(sidecar)) return true;
        if (queryFirstVisibleWithin(sidecar, CHATGPT_STRONG_ACTIVITY_SELECTORS)) return true;
        if (chatGptTurnHasActiveProgress(sidecar)) return true;
      }
    }
    return false;
  }

  function elementHasStrongActivitySignal(element: Element): boolean {
    if (
      element.getAttribute('aria-busy') === 'true' ||
      element.getAttribute('data-streaming') === 'true' ||
      element.getAttribute('data-is-streaming') === 'true'
    ) {
      return true;
    }
    return (element.getAttribute('class') ?? '').split(/\s+/).some((name) => name.includes('loading-shimmer'));
  }

  function chatGptTurnHasActiveProgress(turn: Element): boolean {
    for (const selector of CHATGPT_PROGRESS_SELECTORS) {
      const matches = Array.from(turn.querySelectorAll(selector));
      const first = turn.querySelector(selector);
      if (first && !matches.includes(first)) matches.push(first);
      for (const element of matches) {
        if (isElementVisible(element) && progressIsActive(element)) return true;
      }
    }
    return false;
  }

  function progressIsActive(element: Element): boolean {
    const progress = element as Element & { value?: number; max?: number };
    const value = numericAttributeOrProperty(element, 'aria-valuenow', 'value', progress.value);
    const explicitMax = numericAttributeOrProperty(element, 'aria-valuemax', 'max', progress.max);
    const max = explicitMax ?? (element.getAttribute('role') === 'progressbar' ? 100 : null);
    return value === null || max === null || max <= 0 || value < max;
  }

  function numericAttributeOrProperty(
    element: Element,
    ariaName: string,
    attributeName: string,
    propertyValue: number | undefined,
  ): number | null {
    for (const raw of [element.getAttribute(ariaName), element.getAttribute(attributeName), propertyValue]) {
      if (raw === null || raw === undefined || raw === '') continue;
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function chatGptHasActiveStatusLabel(turn?: Element | null): boolean {
    if (turn && rootHasActiveStatusLabel(turn, CHATGPT_TURN_STATUS_SELECTORS, CHATGPT_ACTIVE_STATUS_LABELS)) {
      return true;
    }
    const belongsToConversation = (element: Element) => chatGptExternalStatusBelongsToConversation(element, turn);
    return (
      rootHasActiveStatusLabel(
        document,
        [...CHATGPT_EXTERNAL_STATUS_SELECTORS, ...CHATGPT_VERIFIED_SIDECAR_SELECTORS],
        CHATGPT_ACTIVE_STATUS_LABELS,
        belongsToConversation,
      ) ||
      rootHasActiveStatusLabel(
        document,
        CHATGPT_EXTERNAL_LIVE_REGION_SELECTORS,
        CHATGPT_EXTERNAL_ACTIVE_STATUS_LABELS,
        belongsToConversation,
      )
    );
  }

  function rootHasActiveStatusLabel(
    root: Document | Element,
    selectors: string[],
    activeLabels: string[],
    acceptElement: (element: Element) => boolean = () => true,
  ): boolean {
    for (const selector of selectors) {
      const matches = Array.from(root.querySelectorAll(selector));
      const first = root.querySelector(selector);
      if (first && !matches.includes(first)) matches.push(first);
      for (const element of matches) {
        if (!isElementVisible(element) || !acceptElement(element)) continue;
        const labels = [element.textContent ?? '', element.getAttribute('aria-label') ?? '']
          .map(normalizeActivityLabel)
          .filter((label) => label.length > 0 && label.length <= 80);
        if (labels.some(chatGptStatusLabelIsCompleted)) continue;
        if (
          labels.some((label) =>
            activeLabels.some((active) => label === active || label.startsWith(`${active} `)),
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function chatGptExternalStatusBelongsToConversation(element: Element, turn?: Element | null): boolean {
    if (turn && elementContains(turn, element)) return true;
    const userTurns = Array.from(document.querySelectorAll(CHATGPT_USER_MESSAGE_SELECTOR));
    const anchor = activeChatGptUserTurnAnchor ?? userTurns[userTurns.length - 1] ?? null;
    return Boolean(anchor && elementFollows(anchor, element));
  }

  function chatGptStatusLabelIsCompleted(label: string): boolean {
    return /^(?:(?:reasoning|(?:pro )?thinking)\s*(?:[·•:—–-]\s*)?)?thought\s+for\s+\d+(?:\.\d+)?\s*(?:ms|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)(?:\s+\d+(?:\.\d+)?\s*(?:ms|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?))*\s*(?:[·•:—–-]\s*)?(?:edit)?$/.test(
      label,
    );
  }

  function normalizeActivityLabel(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.…]+$/g, '')
      .trim();
  }

  function providerStillGeneratingBeforeSend(providerHint?: AIProvider): boolean {
    if (!adapter || adapter.provider !== 'chatgpt') return false;
    if (providerHint && providerHint !== adapter.provider) return false;
    return chatGptHasStrongActivity();
  }

  function rejectSendWhileProviderGenerating(providerHint: AIProvider | undefined, sendOperation: number): boolean {
    if (!providerStillGeneratingBeforeSend(providerHint)) return false;
    const provider = providerHint ?? adapter?.provider;
    if (!provider) return false;
    doneWithError(`${provider} send rejected: provider is still generating`, provider, sendOperation);
    return true;
  }

  function emptyChatGptTerminalGate(): ChatGptTerminalGateState {
    return { turn: null, response: null, completion: null, responseText: '', stableSince: 0, samples: 0 };
  }

  function resetChatGptTerminalGate() {
    chatGptTerminalGate = emptyChatGptTerminalGate();
  }

  function sampleChatGptTerminalGate(): boolean {
    const response = getLatestResponseCandidate();
    const turn = currentChatGptCompletionTurn(response?.element);
    const responseText = response?.text ?? null;
    const strongActivity = chatGptHasStrongActivity(turn);
    const completion = turn && response ? chatGptCompletionEvidence(turn, response) : null;
    if (!turn || !responseText || isThinking() || strongActivity || !completion) {
      if (strongActivity) lastCompletionActivityAt = Date.now();
      resetChatGptTerminalGate();
      return false;
    }

    const now = Date.now();
    if (
      chatGptTerminalGate.turn !== turn ||
      chatGptTerminalGate.response !== response?.element ||
      chatGptTerminalGate.completion !== completion ||
      chatGptTerminalGate.responseText !== responseText
    ) {
      chatGptTerminalGate = {
        turn,
        response: response?.element ?? null,
        completion,
        responseText,
        stableSince: now,
        samples: 1,
      };
      return false;
    }

    chatGptTerminalGate.samples += 1;
    return (
      chatGptTerminalGate.samples >= CHATGPT_TERMINAL_MIN_SAMPLES &&
      now - chatGptTerminalGate.stableSince >= CHATGPT_TERMINAL_MIN_STABLE_MS
    );
  }

  function isThinking(): boolean {
    if (hasDetector(adapter?.thinkingDetectors)) return true;
    return adapter?.provider === 'grok' && queryFirstVisible([GROK_LIVE_STOP_BUTTON_SELECTOR]) !== null;
  }

  // Response completion asks this instead of isThinking(). The split is deliberate: sendStarted()
  // uses isThinking() to decide whether a send landed, and right after a send the last turn is the
  // user message, which carries no copy button. Letting the turn signal reach sendStarted() would
  // make a failed send look accepted and leave the step waiting on a response that never comes.
  function isGenerating(): boolean {
    return (
      isThinking() ||
      (adapter?.provider === 'chatgpt' && chatGptHasStrongActivity(currentChatGptCompletionTurn())) ||
      lastTurnIncomplete()
    );
  }

  function lastTurnIncomplete(): boolean {
    if (!waitingForResponse || !adapter || !lastResponseText) return false;
    const signal = TURN_COMPLETION_SIGNALS[adapter.provider];
    if (!signal) return false;
    const response = getLatestResponseCandidate();
    const turn = currentChatGptCompletionTurn(response?.element);
    if (!turn) return true;
    return !response || chatGptCompletionEvidence(turn, response) === null;
  }

  function failIfTurnCompletionTimedOut(expectedGeneration: number): boolean {
    const thinking = isThinking();
    const completionTurn = currentChatGptCompletionTurn();
    const strongTurnActivity = chatGptHasStrongActivity(completionTurn);
    if (thinking || strongTurnActivity) {
      lastCompletionActivityAt = Date.now();
    }
    if (
      !waitingForResponse ||
      expectedGeneration !== activeResponseGeneration ||
      !adapter ||
      !TURN_COMPLETION_SIGNALS[adapter.provider] ||
      !lastResponseText ||
      thinking ||
      strongTurnActivity ||
      Date.now() - lastCompletionActivityAt < TURN_COMPLETION_CONFIRM_TIMEOUT_MS
    ) {
      return false;
    }
    const activeProvider = adapter?.provider;
    if (!activeProvider) return false;
    clearCheckDone();
    doneWithError(`${activeProvider} response completion could not be confirmed`, activeProvider, activeSendOperation);
    return true;
  }

  function checkIfDone(expectedGeneration = activeResponseGeneration) {
    if (!waitingForResponse || expectedGeneration !== activeResponseGeneration) return;
    if (failIfTurnCompletionTimedOut(expectedGeneration)) return;
    if (isGenerating()) {
      resetChatGptTerminalGate();
      if (checkDoneInterval === undefined) {
        checkDoneInterval = window.setInterval(() => {
          if (!waitingForResponse || expectedGeneration !== activeResponseGeneration) {
            clearCheckDone();
            return;
          }
          if (failIfTurnCompletionTimedOut(expectedGeneration)) return;
          if (!isGenerating()) {
            clearCheckDone();
            if (adapter?.provider === 'chatgpt') {
              checkIfDone(expectedGeneration);
              return;
            }
            finishResponseTimeout = window.setTimeout(() => {
              finishResponseTimeout = undefined;
              if (!waitingForResponse || expectedGeneration !== activeResponseGeneration) return;
              if (failIfTurnCompletionTimedOut(expectedGeneration)) return;
              if (isGenerating()) {
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
    if (adapter?.provider === 'chatgpt') {
      clearCheckDone();
      if (sampleChatGptTerminalGate()) {
        finishResponse(expectedGeneration);
        return;
      }
      clearFinishResponseTimeout();
      finishResponseTimeout = window.setTimeout(() => {
        finishResponseTimeout = undefined;
        checkIfDone(expectedGeneration);
      }, CHATGPT_TERMINAL_SAMPLE_INTERVAL_MS);
      return;
    }
    finishResponse(expectedGeneration);
  }

  function finishResponse(expectedGeneration = activeResponseGeneration) {
    if (!waitingForResponse || expectedGeneration !== activeResponseGeneration || !adapter) return;
    // Must re-read before cancelResponseWait(): getLatestResponseText filters the send-time
    // baseline through waitingForResponse and responseBaselineEls, so after the reset it would
    // return a message that already existed before the send.
    const payload = finalResponseText(lastResponseText, getLatestResponseText());
    const sendOperation = activeSendOperation;
    cancelResponseWait();
    bridge.emit({ v: 1, action: 'RESPONSE_DONE', provider: adapter.provider, payload });
    if (sendOperation !== undefined) releaseSendOperation(sendOperation);
  }

  function cancelResponseWait() {
    waitingForResponse = false;
    clearTimersForResponse();
    responseBaselineEls.clear();
    responseBaselineTextCounts.clear();
    pendingPromptText = '';
    matchingChatGptUserTurnBaseline = 0;
    activeChatGptUserTurnAnchor = null;
    chatGptPreSendUserTurns = [];
    chatGptUserTurnAnchorLatched = false;
    chatGptResponseGenerationObserved = false;
    lastActivatedInput = null;
    lastGrokThinking = undefined;
    resetChatGptTerminalGate();
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

  function recordGrokGenerationActivity() {
    if (adapter?.provider !== 'grok') return;
    const thinking = isThinking();
    const resumed = thinking && lastGrokThinking === false;
    lastGrokThinking = thinking;
    if (!resumed) return;
    // Heavy can resume without changing its intermediate answer. Cancel both the text
    // stability timer and the post-generation timer, then wait for generation to stop again.
    if (responseTimeout !== undefined) window.clearTimeout(responseTimeout);
    responseTimeout = undefined;
    clearFinishResponseTimeout();
    checkIfDone();
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
      recordGrokGenerationActivity();
      // Latch generation before the thinking return, so a reply that lands as thinking
      // clears is still readable. The observer otherwise never reaches the text read.
      noteChatGptResponseGeneration();
      if (isThinking()) return;
      const currentText = getLatestResponseText();
      if (!currentText || currentText === lastResponseText) return;
      clearFinishResponseTimeout();
      lastResponseText = currentText;
      lastCompletionActivityAt = Date.now();
      resetChatGptTerminalGate();

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
      recordGrokGenerationActivity();
      const currentText = getLatestResponseText();
      if (!currentText || currentText === lastResponseText) return;
      clearFinishResponseTimeout();
      lastResponseText = currentText;
      lastCompletionActivityAt = Date.now();
      resetChatGptTerminalGate();
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
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) return input.value;
    return input.textContent ?? '';
  }

  function assertInputLanded(input: Element, text: string, strategy: InputStrategyName) {
    if (!text.trim()) return;
    if (composerTextMatches(input, text)) return;
    if (!getInputText(input).trim()) throw new InputInjectionError(`${strategy} left editor empty after injection`);
    throw new InputInjectionError(`${strategy} produced mismatched editor text after injection`);
  }

  function composerTextMatches(input: Element, expected: string): boolean {
    return compactVisibleText(getInputText(input)) === compactVisibleText(expected);
  }

  function compactVisibleText(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, '');
  }

  function matchingChatGptUserTurns(activeAdapter: AdapterConfig, prompt: string): Element[] {
    if (activeAdapter.provider !== 'chatgpt' || !prompt.trim()) return [];
    return Array.from(document.querySelectorAll(CHATGPT_USER_MESSAGE_SELECTOR)).filter(
      (turn) => chatGptUserTurnMatchesPrompt(turn.textContent ?? '', prompt),
    );
  }

  function chatGptUserTurnMatchesPrompt(content: string, prompt: string): boolean {
    if (compactVisibleText(content) === compactVisibleText(prompt)) return true;
    const contentKey = promptEchoComparisonKey(content);
    const promptKey = promptEchoComparisonKey(prompt);
    if (!contentKey || !promptKey) return false;
    if (contentKey === promptKey) return true;

    // ChatGPT now collapses long submitted turns behind "Show more" and may keep only a prefix in
    // the live DOM. Require both a genuinely long source prompt and a substantial matching prefix;
    // the pre-send matching-count baseline still prevents an older identical turn from confirming
    // a new send.
    if (
      promptKey.length < CHATGPT_COLLAPSED_PROMPT_MIN_SOURCE_CHARS ||
      contentKey.length < CHATGPT_COLLAPSED_PROMPT_MIN_VISIBLE_CHARS
    ) {
      return false;
    }
    const prefixLength = Math.min(
      CHATGPT_COLLAPSED_PROMPT_PREFIX_CHARS,
      contentKey.length,
      promptKey.length,
    );
    return contentKey.slice(0, prefixLength) === promptKey.slice(0, prefixLength);
  }

  function refreshChatGptUserTurnAnchor(activeAdapter: AdapterConfig): Element | null {
    if (activeAdapter.provider !== 'chatgpt') return null;
    if (activeChatGptUserTurnAnchor && !elementIsInDocument(activeChatGptUserTurnAnchor)) {
      activeChatGptUserTurnAnchor = null;
    }
    const matchingTurns = matchingChatGptUserTurns(activeAdapter, pendingPromptText).filter((turn) =>
      elementIsInDocument(turn),
    );
    if (matchingTurns.length > matchingChatGptUserTurnBaseline) {
      activeChatGptUserTurnAnchor = matchingTurns[matchingTurns.length - 1] ?? null;
      if (activeChatGptUserTurnAnchor) chatGptUserTurnAnchorLatched = true;
      return activeChatGptUserTurnAnchor;
    }
    if (activeChatGptUserTurnAnchor) return activeChatGptUserTurnAnchor;
    // The latched bubble is gone and the live match count did not clear the pre-send baseline
    // (older turns share the language-policy prefix). Re-bind only to a connected match that
    // follows every still-connected pre-send turn. A same-count remount never reaches here.
    if (!chatGptUserTurnAnchorLatched) return null;
    const connectedPreSend = chatGptPreSendUserTurns.filter((turn) => elementIsInDocument(turn));
    const followingPreSend = matchingTurns.filter((turn) =>
      connectedPreSend.every((prior) => elementFollows(prior, turn)),
    );
    activeChatGptUserTurnAnchor =
      followingPreSend.length > 0 ? followingPreSend[followingPreSend.length - 1] : null;
    return activeChatGptUserTurnAnchor;
  }

  function elementIsInDocument(element: Element): boolean {
    if ((element as { isConnected?: boolean }).isConnected === false) return false;
    const root = document.documentElement ?? document.body;
    if (!root || root === element || typeof root.compareDocumentPosition !== 'function') return true;
    try {
      return (root.compareDocumentPosition(element) & DOCUMENT_POSITION_DISCONNECTED) === 0;
    } catch {
      return true;
    }
  }

  // Trigger for reading a ChatGPT reply with no connected user-turn anchor: this wait has
  // already seen provider generation (thinking detector or ChatGPT strong activity) at least
  // once. Pre-send generation is rejected before staging, and the flag flips only while
  // waitingForResponse is already true, so the baseline snapshot exists. A message that was
  // already on screen still has to pass responseBaselineEls, responseTextIsBeyondBaseline,
  // isUserMessageElement, and isLikelyPromptEcho — the same filters the other providers use.
  function chatGptMayReadResponseWithoutAnchor(): boolean {
    return waitingForResponse && chatGptResponseGenerationObserved;
  }

  function noteChatGptResponseGeneration(): void {
    if (chatGptResponseGenerationObserved || !waitingForResponse || adapter?.provider !== 'chatgpt') return;
    if (isThinking() || chatGptHasStrongActivity()) chatGptResponseGenerationObserved = true;
  }

  function elementFollows(anchor: Element, candidate: Element): boolean {
    if (anchor === candidate || typeof anchor.compareDocumentPosition !== 'function') return false;
    try {
      const position = anchor.compareDocumentPosition(candidate);
      return (
        (position & DOCUMENT_POSITION_DISCONNECTED) === 0 &&
        (position & DOCUMENT_POSITION_FOLLOWING) !== 0
      );
    } catch {
      return false;
    }
  }

  function countResponseTextKeys(responses: Element[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const response of responses) {
      if (isUserMessageElement(response)) continue;
      const text = extractResponseText(response);
      if (!text) continue;
      const key = compactVisibleText(text);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  function responseTextIsBeyondBaseline(text: string, responses: Element[]): boolean {
    const key = compactVisibleText(text);
    const baselineCount = responseBaselineTextCounts.get(key) ?? 0;
    if (baselineCount === 0) return true;
    let currentCount = 0;
    for (const response of responses) {
      if (isUserMessageElement(response)) continue;
      const currentText = extractResponseText(response);
      if (!currentText || compactVisibleText(currentText) !== key) continue;
      currentCount += 1;
      if (currentCount > baselineCount) return true;
    }
    return false;
  }

  function initialSendConfirmationDelay(activeAdapter: AdapterConfig): number {
    return activeAdapter.provider === 'chatgpt'
      ? CHATGPT_INITIAL_SEND_CONFIRMATION_DELAY_MS
      : SEND_RETRY_DELAY_MS;
  }

  function fallbackSendConfirmationDelay(activeAdapter: AdapterConfig): number {
    return activeAdapter.provider === 'chatgpt'
      ? CHATGPT_FALLBACK_SEND_CONFIRMATION_DELAY_MS
      : SEND_FINAL_VERIFY_DELAY_MS;
  }

  function sendStarted(activeAdapter: AdapterConfig): boolean {
    if (!waitingForResponse) return true;
    if (activeAdapter.provider === 'chatgpt') {
      const anchor = refreshChatGptUserTurnAnchor(activeAdapter);
      // refresh drops a detached bubble. One that was already adopted is still the matching
      // turn for this check; it does not by itself prove the composer was consumed.
      if (!anchor && !chatGptUserTurnAnchorLatched) return false;
      // ChatGPT can paint an optimistic copy of a long user turn before it has consumed the
      // composer. That state looked like a successful send in v1.8.8, cancelled the bounded
      // retry, and left the workflow waiting on a response that could only start after a manual
      // click. Any post-anchor assistant candidate proves that the first send started, including
      // Astra's plain "Pro thinking" phase; it is send evidence here, not completion evidence.
      if (anchor) {
        const response = getLatestResponseCandidate();
        if (response) return true;
      }
      return !chatGptPendingDraftStillInComposer(activeAdapter);
    }
    if (isThinking()) return true;
    const responses = document.querySelectorAll(activeAdapter.responseSelectors.join(', '));
    const latest = responses.length > 0 ? responses[responses.length - 1] : null;
    if (latest && latest !== lastSeenResponseEl) return true;
    const currentInput = queryInput(activeAdapter);
    if (activeAdapter.provider === 'grok') {
      return Boolean(
        currentInput &&
          currentInput === lastActivatedInput &&
          !getInputText(currentInput).trim(),
      );
    }
    return Boolean(currentInput && !getInputText(currentInput).trim());
  }

  function chatGptPendingDraftStillInComposer(activeAdapter: AdapterConfig): boolean {
    if (activeAdapter.provider !== 'chatgpt' || !pendingPromptText) return false;
    const currentInput = queryInput(activeAdapter);
    return Boolean(currentInput && composerTextMatches(currentInput, pendingPromptText));
  }

  function querySendButton(activeAdapter: AdapterConfig, input: Element): Element | null {
    const selectors =
      activeAdapter.provider === 'chatgpt'
        ? [...activeAdapter.sendButtonSelectors, ...CHATGPT_LIVE_SEND_BUTTON_SELECTORS]
        : activeAdapter.sendButtonSelectors;
    const closest = (input as Element & { closest?: (selectors: string) => Element | null }).closest;
    if (typeof closest === 'function') {
      const container = closest.call(input, 'form, fieldset, [data-testid*="composer"]');
      if (container) {
        for (const selector of selectors) {
          const candidate = container.querySelector(selector);
          if (candidate) return candidate;
        }
      }
    }
    return queryFirst(selectors);
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
