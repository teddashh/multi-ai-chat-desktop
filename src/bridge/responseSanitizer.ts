import type { BridgeMessage } from '../../shared/types';

const COMPLETE_POLICY_ECHO_PATTERN =
  /(?:```(?:xml)?[^\S\r\n]*(?:\r?\n)?)?<response-language-policy\b[^>]*>[\s\S]*?<\/response-language-policy>(?:[^\S\r\n]*(?:\r?\n)?```)?/giu;
const PARTIAL_POLICY_ECHO_PATTERN =
  /(?:```(?:xml)?[^\S\r\n]*(?:\r?\n)?)?<response-language-policy\b[^>]*>[\s\S]*$/iu;

export const RESPONSE_LANGUAGE_POLICY_ECHO_ERROR =
  '[Error: provider echoed an internal response-language instruction instead of answering; please retry]';

export interface SanitizedResponseText {
  text: string;
  removedPolicy: boolean;
}

export function stripResponseLanguagePolicyEcho(text: string): SanitizedResponseText {
  const withoutCompleteBlocks = text.replace(COMPLETE_POLICY_ECHO_PATTERN, '');
  const withoutPartialBlock = withoutCompleteBlocks.replace(PARTIAL_POLICY_ECHO_PATTERN, '');
  const removedPolicy = withoutPartialBlock !== text;
  if (!removedPolicy) return { text, removedPolicy: false };
  return {
    text: withoutPartialBlock.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    removedPolicy: true,
  };
}

export function sanitizeResponseLanguagePolicyEcho(message: BridgeMessage): BridgeMessage {
  if (message.action !== 'RESPONSE_CHUNK' && message.action !== 'RESPONSE_DONE') return message;

  const final = message.action === 'RESPONSE_DONE';
  if (typeof message.payload === 'string') {
    const sanitized = stripResponseLanguagePolicyEcho(message.payload);
    if (!sanitized.removedPolicy) return message;
    return { ...message, payload: sanitized.text || (final ? RESPONSE_LANGUAGE_POLICY_ECHO_ERROR : '') };
  }

  if (!message.payload || typeof message.payload !== 'object' || !('text' in message.payload)) return message;
  const payload = message.payload as Record<string, unknown>;
  if (typeof payload.text !== 'string') return message;
  const sanitized = stripResponseLanguagePolicyEcho(payload.text);
  if (!sanitized.removedPolicy) return message;
  return {
    ...message,
    payload: {
      ...payload,
      text: sanitized.text || (final ? RESPONSE_LANGUAGE_POLICY_ECHO_ERROR : ''),
    },
  };
}
