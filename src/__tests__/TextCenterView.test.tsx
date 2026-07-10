import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { TextCenterView } from '../ui/FocusPane';

function renderTextCenterView(props: { thinking: boolean; centerText?: string; centerTextFinal: boolean }): string {
  return renderToStaticMarkup(
    <I18nProvider language="en">
      <TextCenterView {...props} />
    </I18nProvider>,
  );
}

describe('TextCenterView', () => {
  it('shows the thinking indicator and hides partial content while thinking', () => {
    const html = renderTextCenterView({
      thinking: true,
      centerText: 'partial scrape',
      centerTextFinal: false,
    });

    expect(html).toContain('Thinking…');
    expect(html).not.toContain('partial scrape');
  });

  it('renders the latest center text when not masking a thinking response', () => {
    const html = renderTextCenterView({
      thinking: false,
      centerText: 'final center answer',
      centerTextFinal: false,
    });

    expect(html).toContain('final center answer');
  });

  it('renders the idle hint when there is no center text', () => {
    const html = renderTextCenterView({
      thinking: false,
      centerTextFinal: false,
    });

    expect(html).toContain('Ready for your next message.');
  });
});
