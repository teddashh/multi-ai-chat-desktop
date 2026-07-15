import { AI_PROVIDERS } from '../shared/constants';
import type { AIProvider } from '../shared/types';

export type BubbleAuthor = {
  role: 'user' | 'ai';
  provider?: AIProvider | 'system' | (string & {});
  authorLabel?: string;
};

export function bubbleAuthorLabel(bubble: BubbleAuthor): string {
  const authorLabel = bubble.authorLabel?.trim();
  if (authorLabel) return authorLabel;
  if (bubble.role === 'user') return 'You';
  const provider = bubble.provider;
  const catalog = AI_PROVIDERS as Partial<Record<string, { name: string }>>;
  return (provider && catalog[provider]?.name) || 'System';
}
