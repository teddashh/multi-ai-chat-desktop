import { DIGEST_CAP_BYTES, type ReportDigest } from '../../injected/reportDigest';

export type { ReportDigest } from '../../injected/reportDigest';

export interface AdapterNotice {
  provider: string;
  kind: string;
  message?: string;
  version?: number | null;
}

export function formatReportBody(digest: ReportDigest): string {
  const lines: string[] = [];
  lines.push(`**Provider:** ${digest.displayName} (${digest.provider})`);
  lines.push(`**Adapter version:** ${digest.adapterVersion}`);
  lines.push(`**App version:** ${digest.appVersion}`);
  lines.push(`**Path:** ${digest.path}`);
  lines.push('');
  lines.push('### Selector health');
  for (const field of digest.fields) {
    const total = field.matched.length + field.missed.length;
    lines.push(`- **${field.field}** - matched ${field.matched.length}/${total}`);
    for (const selector of field.missed) lines.push(`  - missing: \`${selector}\``);
  }
  if (digest.firstMissingField && digest.candidates.length > 0) {
    lines.push('');
    lines.push(`### Candidate elements (for \`${digest.firstMissingField}\`)`);
    for (const candidate of digest.candidates) {
      const attrs = Object.entries(candidate.attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      lines.push(`- \`<${candidate.tag}${attrs ? ` ${attrs}` : ''}>\` (text length ${candidate.textLength})`);
    }
  }
  lines.push('');
  lines.push('_Selector-structural diagnostics only - no page text, input values, cookies, or storage (SPEC §10.2)._');
  const body = lines.join('\n');
  if (byteLength(body) <= DIGEST_CAP_BYTES) return body;
  const marker = '\n\n_Truncated to satisfy the 10 KB §10.2 privacy cap._';
  return clampToBytes(body, DIGEST_CAP_BYTES - byteLength(marker)) + marker;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

// clamp a string to at most `max` UTF-8 bytes without splitting a multi-byte char (binary search on char len)
function clampToBytes(value: string, max: number): string {
  if (byteLength(value) <= max) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (byteLength(value.slice(0, mid)) <= max) lo = mid;
    else hi = mid - 1;
  }
  // avoid ending on a lone high surrogate (would otherwise encode as a U+FFFD replacement char)
  if (lo > 0) {
    const last = value.charCodeAt(lo - 1);
    if (last >= 0xd800 && last <= 0xdbff) lo -= 1;
  }
  return value.slice(0, lo);
}
