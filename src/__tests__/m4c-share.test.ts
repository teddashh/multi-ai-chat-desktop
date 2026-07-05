import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, CHAT_MODES } from '../../shared/constants';
import { buildMarkdown, exportFilename, type ExportMessage } from '../ui/exportMarkdown';

const fixedDate = new Date('2026-07-04T13:45:07Z');

describe('M4c share export helpers', () => {
  it('renders the mode title, exported line, and separators', () => {
    const mode = 'debate';
    const { content, title } = buildMarkdown([], mode, fixedDate);

    expect(title).toBe(`Multi-AI Chat — ${CHAT_MODES[mode].icon} ${CHAT_MODES[mode].name}`);
    expect(content.split('\n')[0]).toBe(`# ${title}`);
    expect(content).toContain('> Exported: ');
    expect(content).toContain('\n---\n');
  });

  it('renders multiline user messages as blockquotes', () => {
    const messages: ExportMessage[] = [{ role: 'user', content: 'first line\nsecond line' }];
    const { content } = buildMarkdown(messages, 'free', fixedDate);

    expect(content).toContain('## 👤 User\n\n> first line\n> second line');
  });

  it('renders provider names and mode role labels for AI messages', () => {
    const messages: ExportMessage[] = [
      { role: 'ai', provider: 'chatgpt', modeRole: 'pro', content: 'answer' },
    ];
    const { content } = buildMarkdown(messages, 'debate', fixedDate);

    expect(content).toContain(`## 🤖 ${AI_PROVIDERS.chatgpt.name} (pro)\n\nanswer`);
  });

  it('falls back to the raw provider string for unknown providers', () => {
    const messages: ExportMessage[] = [{ role: 'ai', provider: 'system', content: 'notice' }];
    const { content } = buildMarkdown(messages, 'free', fixedDate);

    expect(content).toContain('## 🤖 system\n\nnotice');
  });

  it('renders an empty export as only the header block', () => {
    const { content } = buildMarkdown([], 'consult', fixedDate);

    expect(content).not.toContain('## 👤 User');
    expect(content).not.toContain('## 🤖');
    expect(content.split('\n')).toHaveLength(5);
  });

  it('builds deterministic markdown filenames from ISO timestamps', () => {
    expect(exportFilename('debate', fixedDate)).toBe('multi-ai-chat-debate-2026-07-04-13-45-07.md');
  });
});
