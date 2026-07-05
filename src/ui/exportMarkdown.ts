import { AI_PROVIDERS, CHAT_MODES } from '../../shared/constants';
import type { ChatMode } from '../../shared/types';

/** Structural subset of App.tsx's Bubble that export needs. */
export interface ExportMessage {
  role: 'user' | 'ai';
  provider?: string;
  modeRole?: string;
  content: string;
}

export function buildMarkdown(
  messages: ExportMessage[],
  mode: ChatMode,
  exportedAt: Date,
): { title: string; content: string } {
  const modeInfo = CHAT_MODES[mode];
  const title = `Multi-AI Chat — ${modeInfo.icon} ${modeInfo.name}`;
  const lines: string[] = [`# ${title}`, `> Exported: ${exportedAt.toLocaleString()}`, '', '---', ''];
  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('## 👤 User', '');
      lines.push(...msg.content.split('\n').map((line) => `> ${line}`));
    } else {
      const providerName = msg.provider
        ? (AI_PROVIDERS[msg.provider as keyof typeof AI_PROVIDERS]?.name ?? msg.provider)
        : 'AI';
      const roleLabel = msg.modeRole ? ` (${msg.modeRole})` : '';
      lines.push(`## 🤖 ${providerName}${roleLabel}`, '');
      lines.push(msg.content);
    }
    lines.push('', '---', '');
  }
  return { title, content: lines.join('\n') };
}

/** `multi-ai-chat-<mode>-YYYY-MM-DD-HH-mm-ss.md` */
export function exportFilename(mode: ChatMode, exportedAt: Date): string {
  const ts = exportedAt.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `multi-ai-chat-${mode}-${ts}.md`;
}
