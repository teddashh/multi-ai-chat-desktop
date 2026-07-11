import type { CSSProperties } from 'react';
import type { AIProvider } from '../../shared/types';
import chatgptAvatarUrl from '../assets/themes/ai-sister/chatgpt.webp';
import claudeAvatarUrl from '../assets/themes/ai-sister/claude.webp';
import ensembleUrl from '../assets/themes/ai-sister/ensemble.jpg';
import geminiAvatarUrl from '../assets/themes/ai-sister/gemini.webp';
import grokAvatarUrl from '../assets/themes/ai-sister/grok.webp';
import { useI18n } from '../i18n/context';

const AVATAR_URLS: Record<AIProvider, string> = {
  chatgpt: chatgptAvatarUrl,
  claude: claudeAvatarUrl,
  gemini: geminiAvatarUrl,
  grok: grokAvatarUrl,
};

const PROVIDER_ACCENTS: Record<AIProvider, { solid: string; shadow: string }> = {
  chatgpt: { solid: '#2dd4bf', shadow: 'rgba(45, 212, 191, 0.48)' },
  claude: { solid: '#f6b94b', shadow: 'rgba(246, 185, 75, 0.48)' },
  gemini: { solid: '#a78bfa', shadow: 'rgba(167, 139, 250, 0.5)' },
  grok: { solid: '#8b5cf6', shadow: 'rgba(139, 92, 246, 0.5)' },
};

export type AiSisterAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

export function AiSisterAvatar({
  provider,
  active = false,
  size = 'sm',
  className = '',
}: {
  provider: AIProvider;
  active?: boolean;
  size?: AiSisterAvatarSize;
  className?: string;
}) {
  const style = {
    '--ai-sister-accent': PROVIDER_ACCENTS[provider].solid,
    '--ai-sister-accent-shadow': PROVIDER_ACCENTS[provider].shadow,
  } as CSSProperties;

  return (
    <span
      className={`ai-sister-only ai-sister-avatar ai-sister-avatar--${size} ${className}`}
      data-provider={provider}
      data-active={active ? 'true' : 'false'}
      style={style}
      aria-hidden="true"
    >
      <img src={AVATAR_URLS[provider]} alt="" draggable={false} />
    </span>
  );
}

export function AiSisterBrandMark({ className = '' }: { className?: string }) {
  return <img src={ensembleUrl} alt="" draggable={false} className={`ai-sister-only ai-sister-brand-mark ${className}`} aria-hidden="true" />;
}

export function AiSisterEnsembleCard() {
  const { t } = useI18n();

  return (
    <section className="ai-sister-only ai-sister-ensemble-card" aria-label={t('theme.aiSister.title')}>
      <div className="ai-sister-ensemble-art" aria-hidden="true">
        <img src={ensembleUrl} alt="" draggable={false} />
      </div>
      <div className="min-w-0">
        <div className="ai-sister-edition-badge">{t('theme.aiSister.badge')}</div>
        <div className="ai-sister-ensemble-title">{t('theme.aiSister.title')}</div>
        <p className="ai-sister-ensemble-subtitle">{t('theme.aiSister.subtitle')}</p>
        <div className="ai-sister-ensemble-avatars" aria-hidden="true">
          <AiSisterAvatar provider="chatgpt" size="xs" />
          <AiSisterAvatar provider="claude" size="xs" />
          <AiSisterAvatar provider="gemini" size="xs" />
          <AiSisterAvatar provider="grok" size="xs" />
        </div>
      </div>
    </section>
  );
}
