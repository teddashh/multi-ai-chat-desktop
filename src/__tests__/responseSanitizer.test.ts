import { afterEach, describe, expect, it } from 'vitest';
import type { BridgeMessage } from '../../shared/types';
import { onBridgeMessage, publishBridgeMessage, resetBusForTests } from '../bridge/bus';
import {
  RESPONSE_LANGUAGE_POLICY_ECHO_ERROR,
  sanitizeResponseLanguagePolicyEcho,
  stripResponseLanguagePolicyEcho,
} from '../bridge/responseSanitizer';

const POLICY = [
  '<response-language-policy version="1" setting="auto" interface-locale="zh-TW">',
  'Apply this policy to any natural-language text in your response.',
  '</response-language-policy>',
].join('\n');

afterEach(() => resetBusForTests());

describe('response language policy echo sanitizer', () => {
  it('leaves normal provider answers unchanged', () => {
    expect(stripResponseLanguagePolicyEcho('正常回答')).toEqual({ text: '正常回答', removedPolicy: false });
  });

  it('removes complete and fenced policy echoes while preserving the actual answer', () => {
    expect(stripResponseLanguagePolicyEcho(`${POLICY}\n\n真正的回答`)).toEqual({
      text: '真正的回答',
      removedPolicy: true,
    });
    expect(stripResponseLanguagePolicyEcho(`前言\n\n\`\`\`xml\n${POLICY}\n\`\`\`\n\nAnswer`)).toEqual({
      text: '前言\n\nAnswer',
      removedPolicy: true,
    });
  });

  it('hides an unfinished cumulative streaming echo', () => {
    expect(stripResponseLanguagePolicyEcho('<response-language-policy version="1" setting="auto" interface-locale="zh-TW">\nApply')).toEqual({
      text: '',
      removedPolicy: true,
    });
  });

  it('turns a policy-only final response into a retryable error without losing payload metadata', () => {
    const message: BridgeMessage = {
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: { text: POLICY, truncated: true },
      transport: 'pull',
    };

    expect(sanitizeResponseLanguagePolicyEcho(message)).toMatchObject({
      payload: { text: RESPONSE_LANGUAGE_POLICY_ECHO_ERROR, truncated: true },
    });
  });

  it('sanitizes the central bridge stream before workflow and UI subscribers receive it', () => {
    const received: BridgeMessage[] = [];
    const cleanup = onBridgeMessage((message) => received.push(message));

    publishBridgeMessage({
      v: 1,
      action: 'RESPONSE_DONE',
      provider: 'grok',
      payload: `${POLICY}\n\n實際答案`,
      transport: 'pull',
    });
    cleanup();

    expect(received).toHaveLength(1);
    expect(received[0].payload).toBe('實際答案');
  });
});
