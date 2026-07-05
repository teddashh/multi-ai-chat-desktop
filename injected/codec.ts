// Module scope must stay side-effect-free (runs before subframe guard in the bundle).
//
// Why a document.title codec? Provider pages (ChatGPT/Claude/Gemini/Grok) enforce CSPs that block a
// localhost WebSocket and remote Tauri IPC from the injected script, so there is no normal outbound
// message channel from the page. `document.title` is the one narrow, allowed signal. This is a
// documented Tauri workaround (docs/ARCHITECTURE.md D3, docs/SPEC.md \u00A77) \u2014 NOT a covert channel:
//   - it carries ONLY status HINTS (STATUS_REPORT / "bulk-ready" wake-ups), never authoritative data;
//     the actual response payload is pulled via eval_with_callback (SPEC \u00A77.3), a normal Tauri IPC.
//   - the leading U+200B + "MAC1|" prefix and base64url exist for reliable, collision-free FRAMING
//     (so our frames aren't confused with the page's own title text), not for obfuscation.
//   - the Rust side (bridge.rs) drops any title it can't decode; this codec never reads cookies/storage.
export const TITLE_PREFIX = '\u200BMAC1|';
const TITLE_MAX_CHARS = 900;

export interface DecodedTitleFrame {
  bootId: string;
  seq: number;
  json: unknown;
}

export function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? getTextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return getTextDecoder().decode(bytes);
}

export function encodeTitleFrame(bootId: string, seq: number, payload: unknown): string {
  const json = JSON.stringify(payload);
  const frame = `${TITLE_PREFIX}${bootId}|${seq}|${base64UrlEncode(json)}`;
  if (frame.length > TITLE_MAX_CHARS) {
    throw new Error(`title frame exceeds ${TITLE_MAX_CHARS} chars`);
  }
  return frame;
}

export function decodeTitleFrame(title: string): DecodedTitleFrame | null {
  if (!title.startsWith(TITLE_PREFIX)) return null;
  const parts = title.slice(TITLE_PREFIX.length).split('|');
  if (parts.length !== 3) throw new Error('invalid title frame field count');
  const [bootId, seqText, encoded] = parts;
  const seq = Number(seqText);
  if (!bootId || !Number.isSafeInteger(seq) || seq < 0) {
    throw new Error('invalid title frame identifiers');
  }
  return { bootId, seq, json: JSON.parse(base64UrlDecode(encoded)) };
}

function getTextEncoder(): TextEncoder {
  return new TextEncoder();
}

function getTextDecoder(): TextDecoder {
  return new TextDecoder();
}
