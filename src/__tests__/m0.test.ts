import { describe, expect, it } from 'vitest';
import chatgpt from '../../adapters/chatgpt.json';
import claude from '../../adapters/claude.json';
import gemini from '../../adapters/gemini.json';
import grok from '../../adapters/grok.json';
import {
  AI_PROVIDERS,
  CHAT_MODES,
  DEFAULT_FREE_TARGET_PROVIDERS,
  DOCK_SLOT_PROVIDERS,
  OUTBOX_MAX_BYTES,
  POLL_PULL_MS,
  PROMPTS,
  PULL_MAX_DECODED_BYTES,
  SSO_ALLOWLIST_HOSTS,
} from '../../shared/constants';

describe('M0 shared constants and adapter seeds', () => {
  it('exports bridge and navigation constants from SPEC sections 6.3 and 7.3', () => {
    expect(AI_PROVIDERS.gemini.url).toBe('https://gemini.google.com');
    expect(DOCK_SLOT_PROVIDERS).toEqual(['chatgpt', 'claude', 'gemini', 'grok']);
    expect(DEFAULT_FREE_TARGET_PROVIDERS).toEqual(['chatgpt', 'claude', 'gemini', 'grok']);
    expect(PULL_MAX_DECODED_BYTES).toBe(1_048_576);
    expect(OUTBOX_MAX_BYTES).toBe(10_485_760);
    expect(POLL_PULL_MS).toBe(500);
    expect(SSO_ALLOWLIST_HOSTS).toContain('accounts.google.com');
    expect(SSO_ALLOWLIST_HOSTS).toContain('github.com');
  });

  it('keeps original extension mode labels and prompt data available', () => {
    expect(CHAT_MODES.free).toMatchObject({
      name: '自由模式',
      description: '同時發給四家，各自獨立回答',
      icon: '⚡',
      serial: false,
    });
    expect(CHAT_MODES.coding.icon).toBe('💻');
    expect(PROMPTS.debate.pro('問題')).toBe('請從支持、贊同的角度回答以下問題，提出你最強的論點：\n\n問題');
    expect(PROMPTS.consult.first('問題')).toBe('問題');
    expect(PROMPTS.coding.plannerSpec('需求')).toContain('需求：需求');
    expect(PROMPTS.roundtable.buildPrompt('議題', 1, 'ChatGPT', [])).toContain('【第一輪・開場立論】');
  });

  it('matches SPEC section 5.1 strategy and timing seed values', () => {
    expect(chatgpt.adapterVersion).toBe(6);
    expect(chatgpt.inputStrategy).toBe('prosemirror-paste');
    expect(chatgpt.timing.doneDelayMs).toBe(3000);
    expect(chatgpt.timing.chunkDebounceMs).toBe(800);

    expect(claude.inputStrategy).toBe('prosemirror-paste');
    expect(claude.timing.doneDelayMs).toBe(5000);
    expect(claude.timing.chunkDebounceMs).toBe(500);

    expect(gemini.inputStrategy).toBe('quill-angular');
    expect(gemini.timing.doneDelayMs).toBe(4000);
    expect(gemini.timing.chunkDebounceMs).toBe(600);

    expect(grok.inputStrategy).toBe('prosemirror-paste');
    expect(grok.timing.doneDelayMs).toBe(8000);
    expect(grok.timing.chunkDebounceMs).toBe(600);
  });

});
