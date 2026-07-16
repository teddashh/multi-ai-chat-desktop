import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, CHAT_MODES } from '../../shared/constants';
import {
  buildMarkdown,
  exportFilename,
  matchingSnapshotForConversation,
  type ExportMessage,
} from '../ui/exportMarkdown';
import type { ExecutionSnapshot } from '../workflow/snapshot/types';

const fixedDate = new Date('2026-07-04T13:45:07Z');

describe('M4c share export helpers', () => {
  it('renders the mode title, exported line, and separators', () => {
    const mode = 'debate';
    const { content, title } = buildMarkdown([], mode, fixedDate);

    expect(title).toBe(`Multi-AI Chat — ${CHAT_MODES[mode].icon} ${CHAT_MODES[mode].name}`);
    expect(content.split('\n')[0]).toBe(`# ${title}`);
    expect(content).toContain('> Exported: ');
    expect(content).toContain('> Exported (UTC): 2026-07-04T13:45:07.000Z');
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
    expect(content.split('\n')).toHaveLength(6);
  });

  it('labels brainstorm exports without changing their underlying free mode', () => {
    const preset = { id: 'brainstorm', icon: '✨', name: 'Brainstorm' };
    const { content, title } = buildMarkdown([], 'free', fixedDate, { preset });

    expect(title).toBe('Multi-AI Chat — ✨ Brainstorm');
    expect(content.split('\n')[0]).toBe('# Multi-AI Chat — ✨ Brainstorm');
    expect(exportFilename('free', fixedDate, preset.id)).toBe('multi-ai-chat-brainstorm-2026-07-04-13-45-07.md');
  });

  it('renders app, workflow, snapshot, timing, and adapter provenance', () => {
    const snapshot = buildSnapshot();
    const { content } = buildMarkdown([{ role: 'user', content: 'question' }], 'roundtable', fixedDate, {
      appVersion: '1.0.2',
      snapshot,
    });

    expect(content).toContain('> App version: 1.0.2');
    expect(content).toContain('> Latest workflow: roundtable v1');
    expect(content).toContain('> Latest snapshot: snapshot-export');
    expect(content).toContain('> Latest run app version: 1.0.1');
    expect(content).toContain('> Latest run (UTC): 2026-07-04T13:40:00.000Z → 2026-07-04T13:44:00.000Z');
    expect(content).toContain(`> Adapter versions: ${AI_PROVIDERS.chatgpt.name} v7, ${AI_PROVIDERS.claude.name} v8`);
  });

  it('only attaches the latest snapshot to its own conversation question', () => {
    const snapshot = buildSnapshot();

    expect(matchingSnapshotForConversation([{ role: 'user', content: 'question' }], snapshot)).toBe(snapshot);
    expect(matchingSnapshotForConversation([{ role: 'user', content: 'another topic' }], snapshot)).toBeUndefined();
    expect(
      matchingSnapshotForConversation(
        [
          { role: 'user', content: 'question' },
          { role: 'ai', provider: 'chatgpt', content: 'answer' },
          { role: 'user', content: 'follow-up' },
        ],
        snapshot,
      ),
    ).toBeUndefined();
  });

  it('builds deterministic markdown filenames from ISO timestamps', () => {
    expect(exportFilename('debate', fixedDate)).toBe('multi-ai-chat-debate-2026-07-04-13-45-07.md');
  });
});

function buildSnapshot(): ExecutionSnapshot {
  return {
    snapshotId: 'snapshot-export',
    graphId: 'roundtable',
    graphVersion: 1,
    appVersion: '1.0.1',
    createdAt: '2026-07-04T13:40:00.000Z',
    completedAt: '2026-07-04T13:44:00.000Z',
    adapterVersions: { chatgpt: 7, claude: 8 },
    roleMap: {},
    redactionTier: 'full-local',
    userQuestion: { tier: 'full-local', kind: 'inline', text: 'question' },
    steps: [],
    humanEdits: [],
  };
}
