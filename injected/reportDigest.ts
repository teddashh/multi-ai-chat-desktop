export interface ReportElement {
  tagName: string;
  getAttribute(name: string): string | null;
  textContent: string | null;
  value?: string;
}

export interface ReportEnv {
  href: string;
  appVersion: string;
  querySelectorAll(selector: string): ReportElement[];
}

export interface FieldHealth {
  field: string;
  matched: string[];
  missed: string[];
  state: 'available' | 'missing' | 'not-rendered';
  reason?: 'composer-empty' | 'new-session';
}

export interface CandidateSummary {
  tag: string;
  attrs: Record<string, string>;
  textLength: number;
}

export interface ReportDigest {
  provider: string;
  displayName: string;
  adapterVersion: number;
  appVersion: string;
  path: string;
  pageContext: 'new-session' | 'conversation' | 'unknown';
  composerHasText: boolean;
  fields: FieldHealth[];
  firstMissingField?: string;
  candidates: CandidateSummary[];
}

interface AdapterLike {
  provider: string;
  displayName?: string;
  adapterVersion: number;
  inputSelectors?: string[];
  sendButtonSelectors?: string[];
  responseSelectors?: string[];
  loginDetectors?: string[];
}

const ATTR_ALLOWLIST = ['id', 'class', 'data-testid', 'aria-label'];
const CANDIDATE_PROBES: Record<string, string[]> = {
  inputSelectors: ['textarea', '[contenteditable="true"]', '[role="textbox"]', '[data-testid]'],
  sendButtonSelectors: ['button', '[role="button"]', '[data-testid]'],
  responseSelectors: [
    'model-response',
    'message-content',
    'article',
    '[data-message-author-role]',
    '[data-testid*="message"]',
    '[class*="response"]',
    '[class*="message"]',
  ],
  loginDetectors: ['textarea', '[contenteditable="true"]', '[role="textbox"]', 'button', '[data-testid]'],
};
export const DIGEST_CAP_BYTES = 10 * 1024;

export function buildReportDigest(adapter: AdapterLike, env: ReportEnv): ReportDigest {
  const path = safePath(env.href);
  const pageContext = classifyPageContext(adapter.provider, path);
  const composer = queryFirst(adapter.inputSelectors ?? [], env);
  const composerHasText = Boolean(elementText(composer).trim());
  const fieldDefs: Array<[string, string[]]> = [
    ['inputSelectors', adapter.inputSelectors ?? []],
    ['sendButtonSelectors', adapter.sendButtonSelectors ?? []],
    ['responseSelectors', adapter.responseSelectors ?? []],
    ['loginDetectors', adapter.loginDetectors ?? []],
  ];
  const fields: FieldHealth[] = [];
  let firstMissingField: string | undefined;
  for (const [field, selectors] of fieldDefs) {
    const matched: string[] = [];
    const missed: string[] = [];
    for (const selector of selectors) {
      if (queryAll(env, selector).length > 0) matched.push(selector);
      else missed.push(selector);
    }
    const observation = fieldObservation(field, selectors.length, matched.length, composerHasText, pageContext);
    fields.push({ field, matched, missed, ...observation });
    if (!firstMissingField && selectors.length > 0 && observation.state === 'missing') firstMissingField = field;
  }
  const candidates = firstMissingField ? collectCandidates(env, firstMissingField) : [];
  let digest: ReportDigest = {
    provider: adapter.provider,
    displayName: adapter.displayName ?? adapter.provider,
    adapterVersion: adapter.adapterVersion,
    appVersion: env.appVersion,
    path,
    pageContext,
    composerHasText,
    fields,
    firstMissingField,
    candidates,
  };
  if (byteLength(JSON.stringify(digest)) > DIGEST_CAP_BYTES) {
    digest = { ...digest, candidates: [] };
  }
  return digest;
}

function fieldObservation(
  field: string,
  selectorCount: number,
  matchedCount: number,
  composerHasText: boolean,
  pageContext: ReportDigest['pageContext'],
): Pick<FieldHealth, 'state' | 'reason'> {
  if (selectorCount === 0) return { state: 'available' };
  if (matchedCount > 0) return { state: 'available' };
  if (field === 'sendButtonSelectors' && !composerHasText) {
    return { state: 'not-rendered', reason: 'composer-empty' };
  }
  if (field === 'responseSelectors' && pageContext === 'new-session') {
    return { state: 'not-rendered', reason: 'new-session' };
  }
  return { state: 'missing' };
}

function collectCandidates(env: ReportEnv, field: string): CandidateSummary[] {
  const out: CandidateSummary[] = [];
  const seen = new Set<ReportElement>();
  const probes = CANDIDATE_PROBES[field] ?? CANDIDATE_PROBES.inputSelectors;
  for (const probe of probes) {
    for (const el of queryAll(env, probe)) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(summarize(el));
      if (out.length >= 50) break;
    }
    if (out.length >= 50) break;
  }
  return field === 'responseSelectors' ? out.slice(-5) : out.slice(0, 5);
}

function summarize(el: ReportElement): CandidateSummary {
  const attrs: Record<string, string> = {};
  for (const name of ATTR_ALLOWLIST) {
    const value = el.getAttribute(name);
    if (value != null) attrs[name] = value.slice(0, 40);
  }
  return { tag: el.tagName.toLowerCase(), attrs, textLength: (el.textContent ?? '').length };
}

function safePath(href: string): string {
  try {
    return new URL(href).pathname.slice(0, 200);
  } catch {
    return '';
  }
}

function classifyPageContext(provider: string, path: string): ReportDigest['pageContext'] {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const newSessionPaths: Record<string, string[]> = {
    chatgpt: ['/', '/new'],
    claude: ['/new'],
    gemini: ['/app'],
    grok: ['/'],
  };
  if (newSessionPaths[provider]?.includes(normalized)) return 'new-session';
  const conversationPrefixes: Record<string, string[]> = {
    chatgpt: ['/c/', '/g/'],
    claude: ['/chat/'],
    gemini: ['/app/'],
    grok: ['/c/'],
  };
  if (conversationPrefixes[provider]?.some((prefix) => normalized.startsWith(prefix))) return 'conversation';
  return 'unknown';
}

function queryFirst(selectors: string[], env: ReportEnv): ReportElement | undefined {
  for (const selector of selectors) {
    const first = queryAll(env, selector)[0];
    if (first) return first;
  }
  return undefined;
}

function queryAll(env: ReportEnv, selector: string): ReportElement[] {
  try {
    return env.querySelectorAll(selector);
  } catch {
    return [];
  }
}

function elementText(element: ReportElement | undefined): string {
  if (!element) return '';
  return typeof element.value === 'string' ? element.value : (element.textContent ?? '');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
