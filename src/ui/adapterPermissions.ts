import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider } from '../../shared/types';

export type AdapterSelectorRef =
  | string
  | {
      selector?: string;
      textIncludes?: string;
      textExcludes?: string;
    };

export interface AdapterPermissionSelectorDetails {
  responseSelectors?: readonly AdapterSelectorRef[];
  loginDetectors?: readonly AdapterSelectorRef[];
  loggedOutDetectors?: readonly AdapterSelectorRef[];
  thinkingDetectors?: readonly AdapterSelectorRef[];
  inputSelectors?: readonly AdapterSelectorRef[];
  sendButtonSelectors?: readonly AdapterSelectorRef[];
  stopButtonSelectors?: readonly AdapterSelectorRef[];
}

export interface AdapterPermissionLine {
  title: string;
  detail: string;
  selectors?: string[];
}

export interface AdapterPermissionSummary {
  provider: AIProvider;
  providerName: string;
  selectorDetailsAvailable: boolean;
  reads: AdapterPermissionLine[];
  writes: AdapterPermissionLine[];
  cannot: AdapterPermissionLine[];
  note?: string;
}

const CANNOT_LINES: readonly AdapterPermissionLine[] = [
  {
    title: 'Cookies, passwords, and browser storage',
    detail: 'Provider webviews get zero Tauri permissions, and the injected engine has no code path to read cookies, password values, or localStorage.',
  },
  {
    title: 'Other tabs, webviews, apps, or files',
    detail: 'The adapter runs only inside this provider webview. It cannot inspect another provider, browser tab, window, file, or desktop app.',
  },
  {
    title: 'A hidden third-party relay',
    detail:
      'This adapter does not relay your prompts or replies to any server other than the AI provider site you opened; that provider naturally receives your prompt and returns the reply. There is no separate or hidden third-party relay. Beyond that provider, conversation data leaves your machine only when YOU explicitly export it (Share to a file / HackMD) or file a broken-adapter report.',
  },
];

export function buildAdapterPermissionSummary(
  provider: AIProvider,
  selectors?: AdapterPermissionSelectorDetails,
): AdapterPermissionSummary {
  const providerName = AI_PROVIDERS[provider].name;
  const responseSelectors = normalizeSelectorRefs(selectors?.responseSelectors);
  const loginSelectors = normalizeSelectorRefs(selectors?.loginDetectors);
  const loggedOutSelectors = normalizeSelectorRefs(selectors?.loggedOutDetectors);
  const thinkingSelectors = normalizeSelectorRefs(selectors?.thinkingDetectors);
  const inputSelectors = normalizeSelectorRefs(selectors?.inputSelectors);
  const sendSelectors = normalizeSelectorRefs(selectors?.sendButtonSelectors);
  const stopSelectors = normalizeSelectorRefs(selectors?.stopButtonSelectors);
  const selectorDetailsAvailable =
    responseSelectors.length > 0 ||
    loginSelectors.length > 0 ||
    loggedOutSelectors.length > 0 ||
    thinkingSelectors.length > 0 ||
    inputSelectors.length > 0 ||
    sendSelectors.length > 0 ||
    stopSelectors.length > 0;

  return {
    provider,
    providerName,
    selectorDetailsAvailable,
    reads: [
      {
        title: "The AI's reply text",
        detail: responseSelectors.length
          ? `Reads text from ${providerName} page elements that match these adapter response selectors (intended: the assistant's reply).`
          : `Reads text from the page elements this adapter's response selectors match (intended: the assistant's reply).`,
        selectors: optionalSelectors(responseSelectors),
      },
      {
        title: 'Login, logged-out, and thinking status',
        detail:
          loginSelectors.length || loggedOutSelectors.length || thinkingSelectors.length
            ? `Runs presence / text-match checks on ${providerName}'s adapter-defined login, logged-out, and thinking selectors.`
            : 'Runs presence / text-match checks on adapter-defined login, logged-out, and thinking selectors so the control pane can show ready, logged out, blocked, or streaming status.',
        selectors: optionalSelectors([...loginSelectors, ...loggedOutSelectors, ...thinkingSelectors]),
      },
      {
        title: 'The composer text after insertion',
        detail: 'Reads the composer text after insertion to verify/retry that your prompt was entered.',
        selectors: optionalSelectors(inputSelectors),
      },
      {
        title: 'Broken-adapter diagnostics',
        detail:
          'Reads broken-adapter diagnostics only when YOU click Report: which selectors match/miss, allowlisted element attributes, and text LENGTHS - never the page/message text itself.',
      },
    ],
    writes: [
      {
        title: 'The prompt composer',
        detail: inputSelectors.length
          ? `Types your prompt into ${providerName}'s composer element that matches these adapter selectors.`
          : `Types your prompt into ${providerName}'s composer element identified by the adapter.`,
        selectors: optionalSelectors(inputSelectors),
      },
      {
        title: 'The Send control',
        detail: sendSelectors.length
          ? `Clicks ${providerName}'s send control that matches these adapter selectors.`
          : `Clicks ${providerName}'s Send control identified by the adapter.`,
        selectors: optionalSelectors(sendSelectors),
      },
      {
        title: 'Enter key (fallback)',
        detail: 'Dispatches Enter to the composer when the send button is missing/disabled or the adapter uses the enter send-strategy.',
        selectors: optionalSelectors(inputSelectors),
      },
      {
        title: 'Stop control (only when YOU cancel)',
        detail: 'Clicks the adapter-defined stop button to cancel an in-flight run.',
        selectors: optionalSelectors(stopSelectors),
      },
    ],
    cannot: CANNOT_LINES.map((line) => ({ ...line })),
    note: selectorDetailsAvailable
      ? undefined
      : 'Exact selector names are not exposed to the control pane yet; this shows the fixed adapter envelope.',
  };
}

function normalizeSelectorRefs(selectors: readonly AdapterSelectorRef[] | undefined): string[] {
  if (!selectors) return [];
  const normalized = selectors.map(formatSelectorRef).filter((selector): selector is string => selector.length > 0);
  return [...new Set(normalized)];
}

function formatSelectorRef(selector: AdapterSelectorRef): string {
  if (typeof selector === 'string') return selector.trim();
  const base = selector.selector?.trim() ?? '';
  if (!base) return '';
  const clauses = [
    selector.textIncludes ? `text includes "${selector.textIncludes}"` : '',
    selector.textExcludes ? `text excludes "${selector.textExcludes}"` : '',
  ].filter(Boolean);
  return clauses.length ? `${base} (${clauses.join('; ')})` : base;
}

function optionalSelectors(selectors: string[]): string[] | undefined {
  return selectors.length > 0 ? selectors : undefined;
}
