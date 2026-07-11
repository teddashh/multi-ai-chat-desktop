import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { AiSisterAvatar, AiSisterEnsembleCard } from '../ui/AiSisterTheme';

describe('AI-Sister commemorative theme components', () => {
  it('renders the ensemble card with all four provider portraits', () => {
    const html = renderToStaticMarkup(
      <I18nProvider language="en">
        <AiSisterEnsembleCard />
      </I18nProvider>,
    );

    expect(html).toContain('AI-Sister Commemorative Edition');
    expect(html).toContain('Final commemorative edition');
    expect(html.match(/ai-sister-avatar--xs/g)).toHaveLength(4);
    for (const provider of ['chatgpt', 'claude', 'gemini', 'grok']) {
      expect(html).toContain(`data-provider="${provider}"`);
    }
  });

  it('marks an active provider portrait for the speaking animation', () => {
    const html = renderToStaticMarkup(<AiSisterAvatar provider="claude" active size="lg" />);

    expect(html).toContain('data-provider="claude"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('ai-sister-avatar--lg');
  });
});
