// Module scope must stay side-effect-free (runs before subframe guard in the bundle).
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
