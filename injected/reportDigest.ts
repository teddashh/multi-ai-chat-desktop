export interface ReportElement {
  tagName: string;
  getAttribute(name: string): string | null;
  textContent: string | null;
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
const CANDIDATE_PROBE = ['textarea', '[contenteditable="true"]', 'button', '[role="textbox"]', '[data-testid]'];
export const DIGEST_CAP_BYTES = 10 * 1024;

export function buildReportDigest(adapter: AdapterLike, env: ReportEnv): ReportDigest {
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
      if (env.querySelectorAll(selector).length > 0) matched.push(selector);
      else missed.push(selector);
    }
    fields.push({ field, matched, missed });
    if (!firstMissingField && selectors.length > 0 && matched.length === 0) firstMissingField = field;
  }
  const candidates = firstMissingField ? collectCandidates(env) : [];
  let digest: ReportDigest = {
    provider: adapter.provider,
    displayName: adapter.displayName ?? adapter.provider,
    adapterVersion: adapter.adapterVersion,
    appVersion: env.appVersion,
    path: safePath(env.href),
    fields,
    firstMissingField,
    candidates,
  };
  if (byteLength(JSON.stringify(digest)) > DIGEST_CAP_BYTES) {
    digest = { ...digest, candidates: [] };
  }
  return digest;
}

function collectCandidates(env: ReportEnv): CandidateSummary[] {
  const out: CandidateSummary[] = [];
  const seen = new Set<ReportElement>();
  for (const probe of CANDIDATE_PROBE) {
    for (const el of env.querySelectorAll(probe)) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(summarize(el));
      if (out.length >= 5) return out;
    }
  }
  return out;
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

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
