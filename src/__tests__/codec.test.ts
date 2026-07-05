import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode, decodeTitleFrame, encodeTitleFrame } from '../../injected/codec';

describe('bridge codec', () => {
  it('round-trips title frames and returns null for non-frames', () => {
    const payload = { v: 1, action: 'STATUS_REPORT', payload: { text: 'hello 中文' } };
    const frame = encodeTitleFrame('boot1234', 42, payload);
    expect(frame.startsWith('\u200BMAC1|boot1234|42|')).toBe(true);
    expect(decodeTitleFrame(frame)).toEqual({ bootId: 'boot1234', seq: 42, json: payload });
    expect(decodeTitleFrame('ChatGPT')).toBeNull();
  });

  it('throws when title frames exceed 900 chars', () => {
    expect(() => encodeTitleFrame('boot1234', 1, { data: 'x'.repeat(900) })).toThrow(/900/);
  });

  it('uses base64url without padding, plus, or slash and preserves UTF-8', () => {
    const encoded = base64UrlEncode('中文 + / =');
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(base64UrlDecode(encoded)).toBe('中文 + / =');
  });
});
